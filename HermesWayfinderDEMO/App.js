import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert } from 'react-native';
import { Compass, MapPin, Navigation, Camera as CameraIcon, Mic } from 'lucide-react-native';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// Configure your Gemini API key here
// Get it from: https://makersuite.google.com/app/apikey
const GEMINI_API_KEY = 'YOUR_GEMINI_KEY_HERE';

// Define indoor map with beacon zones
const INDOOR_MAP = {
  zones: [
    { id: 'entrance', name: 'Entrada Principal', x: 50, y: 20, description: 'Portas de vidro com recepção à frente' },
    { id: 'lobby', name: 'Saguão', x: 50, y: 40, description: 'Espaço aberto com áreas de estar' },
    { id: 'hallway1', name: 'Corredor Leste', x: 80, y: 40, description: 'Corredor longo com salas em ambos os lados' },
    { id: 'hallway2', name: 'Corredor Oeste', x: 20, y: 40, description: 'Corredor que leva aos banheiros' },
    { id: 'cafe', name: 'Cafeteria', x: 80, y: 70, description: 'Cafeteria com mesas e balcão' },
    { id: 'restroom', name: 'Banheiros', x: 20, y: 70, description: 'Instalações sanitárias' },
    { id: 'elevator', name: 'Elevadores', x: 50, y: 70, description: 'Conjunto de três elevadores' }
  ],
  walls: [
    // Outer walls
    { x1: 5, y1: 5, x2: 95, y2: 5 },     // Top wall
    { x1: 5, y1: 5, x2: 5, y2: 95 },     // Left wall
    { x1: 95, y1: 5, x2: 95, y2: 95 },   // Right wall
    { x1: 5, y1: 95, x2: 95, y2: 95 },   // Bottom wall

    // Interior walls - creating rooms
    { x1: 35, y1: 25, x2: 65, y2: 25 },  // Top of lobby
    { x1: 35, y1: 55, x2: 35, y2: 95 },  // Left interior wall
    { x1: 65, y1: 55, x2: 65, y2: 95 },  // Right interior wall
    { x1: 35, y1: 55, x2: 65, y2: 55 },  // Bottom of lobby area
  ],
  connections: {
    'entrance': ['lobby'],
    'lobby': ['entrance', 'hallway1', 'hallway2', 'elevator'],
    'hallway1': ['lobby', 'cafe'],
    'hallway2': ['lobby', 'restroom'],
    'cafe': ['hallway1', 'elevator'],
    'restroom': ['hallway2', 'elevator'],
    'elevator': ['lobby', 'cafe', 'restroom']
  }
};

const BeaconNavigationMock = () => {
  const [currentZone, setCurrentZone] = useState(INDOOR_MAP.zones[1]); // Start at lobby
  const [position, setPosition] = useState({ x: 50, y: 50 }); // Start in middle of map
  const [stepCount, setStepCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [heading, setHeading] = useState(0); // 0-360 degrees
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
  const [navigationTarget, setNavigationTarget] = useState(null);
  const [accelSubscription, setAccelSubscription] = useState(null);
  const [magnetSubscription, setMagnetSubscription] = useState(null);
  const [wallWarning, setWallWarning] = useState(null);
  const [currentPath, setCurrentPath] = useState([]);
  const [nextWaypoint, setNextWaypoint] = useState(null);
  const [audioInstruction, setAudioInstruction] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasAudioPermission, setHasAudioPermission] = useState(false);
  const [recording, setRecording] = useState(null);

  const lastAccelRef = useRef({ x: 0, y: 0, z: 0, timestamp: Date.now() });
  const headingRef = useRef(0); // Track current heading for step calculations
  const lastInstructionRef = useRef({ time: 0, type: null });
  const cameraRef = useRef(null);
  const capturedPhotoRef = useRef(null);
  const stepThreshold = 0.25;
  const stepDistance = 1.5; // Distance moved per step in map units (increased for testing)

  // Request audio permissions on mount
  useEffect(() => {
    (async () => {
      const audio = await Audio.requestPermissionsAsync();
      setHasAudioPermission(audio.status === 'granted');
    })();
  }, []);

  useEffect(() => {
    _subscribeAccel();
    _subscribeMagnet();
    return () => {
      _unsubscribeAccel();
      _unsubscribeMagnet();
      Speech.stop(); // Stop any ongoing speech when component unmounts
      if (recording) {
        recording.stopAndUnloadAsync().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    // Check if we've entered a new zone
    checkZoneEntry();
  }, [position]);

  useEffect(() => {
    // Check for navigation instructions
    if (nextWaypoint && currentPath.length > 0) {
      checkNavigationInstructions();
    }
  }, [position, heading]);

  const playTTS = async (text) => {
    // Stop any ongoing speech
    Speech.stop();

    // Speak the text in Portuguese
    Speech.speak(text, {
      language: 'pt-BR',
      pitch: 1.0,
      rate: 0.9,
    });

    // Also show visual feedback
    setAudioInstruction(text);
    setTimeout(() => setAudioInstruction(null), 3000);
  };

  const _subscribeAccel = () => {
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;

      setAccelerometerData({
        x: x.toFixed(2),
        y: y.toFixed(2),
        z: z.toFixed(2)
      });

      // Calculate acceleration magnitude
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const lastMagnitude = Math.sqrt(
        lastAccelRef.current.x ** 2 +
        lastAccelRef.current.y ** 2 +
        lastAccelRef.current.z ** 2
      );

      const delta = Math.abs(magnitude - lastMagnitude);
      const now = Date.now();

      // Detect step (spike in acceleration)
      if (delta > stepThreshold && now - lastAccelRef.current.timestamp > 250) {
        takeStep(headingRef.current);
        lastAccelRef.current = { x, y, z, timestamp: now };
      }
    });
    setAccelSubscription(sub);
  };

  const _subscribeMagnet = () => {
    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener(magnetometerData => {
      const { x, y } = magnetometerData;
      // Calculate heading (0-360 degrees)
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle = (angle + 360) % 360;
      const roundedAngle = Math.round(angle);
      setHeading(roundedAngle);
      headingRef.current = roundedAngle; // Keep ref in sync for step calculations
    });
    setMagnetSubscription(sub);
  };

  const _unsubscribeAccel = () => {
    accelSubscription && accelSubscription.remove();
    setAccelSubscription(null);
  };

  const _unsubscribeMagnet = () => {
    magnetSubscription && magnetSubscription.remove();
    setMagnetSubscription(null);
  };

  const takeStep = (currentHeading) => {
    setStepCount(prev => prev + 1);
    setIsWalking(true);
    setTimeout(() => setIsWalking(false), 500);

    // Move position based on heading
    setPosition(prev => {
      const radians = (currentHeading - 90) * (Math.PI / 180); // Convert to radians, adjust for compass
      const newX = prev.x + Math.cos(radians) * stepDistance;
      const newY = prev.y + Math.sin(radians) * stepDistance;

      // Check for wall collisions
      const collision = checkWallCollision(prev, { x: newX, y: newY });

      if (collision.hit) {
        // Don't move if we hit a wall
        setWallWarning('⚠️ Parede à frente!');
        setTimeout(() => setWallWarning(null), 2000);
        return prev;
      }

      // Check if we're getting close to a wall
      const warning = checkWallProximity({ x: newX, y: newY }, currentHeading);
      setWallWarning(warning);
      if (warning) {
        setTimeout(() => setWallWarning(null), 2000);
      }

      // Apply bounds and return new position
      const boundedX = Math.max(5, Math.min(95, newX));
      const boundedY = Math.max(5, Math.min(95, newY));
      return { x: boundedX, y: boundedY };
    });
  };

  const checkWallCollision = (oldPos, newPos) => {
    const buffer = 2; // Collision distance from wall

    for (const wall of INDOOR_MAP.walls) {
      const dist = distanceToLineSegment(newPos, wall);
      if (dist < buffer) {
        return { hit: true, wall };
      }
    }
    return { hit: false };
  };

  const checkWallProximity = (pos, heading) => {
    const warningDistance = 5; // Warning distance from wall

    // Project position forward based on heading
    const radians = (heading - 90) * (Math.PI / 180);
    const lookAheadX = pos.x + Math.cos(radians) * warningDistance;
    const lookAheadY = pos.y + Math.sin(radians) * warningDistance;

    for (const wall of INDOOR_MAP.walls) {
      const dist = distanceToLineSegment({ x: lookAheadX, y: lookAheadY }, wall);
      if (dist < 3) {
        return '⚠️ Cuidado! Parede próxima';
      }
    }
    return null;
  };

  const distanceToLineSegment = (point, wall) => {
    const { x1, y1, x2, y2 } = wall;
    const px = point.x;
    const py = point.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
  };

  const checkZoneEntry = () => {
    // Check if current position is near any zone
    for (const zone of INDOOR_MAP.zones) {
      const distance = Math.sqrt(
        Math.pow(position.x - zone.x, 2) +
        Math.pow(position.y - zone.y, 2)
      );

      // If within 8 units of zone center, enter that zone
      if (distance < 8 && zone.id !== currentZone.id) {
        setCurrentZone(zone);

        // Check if this is our destination
        if (zone.id === navigationTarget) {
          setNavigationTarget(null);
          setCurrentPath([]);
          setNextWaypoint(null);
          playTTS(`Você chegou: ${zone.name}`);
        }
        break;
      }
    }
  };

  const findPath = (start, end) => {
    // Simple BFS pathfinding
    const queue = [[start]];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const path = queue.shift();
      const node = path[path.length - 1];

      if (node === end) return path;

      const neighbors = INDOOR_MAP.connections[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return null;
  };

  const startNavigation = (targetZoneId) => {
    setNavigationTarget(targetZoneId);

    // Find path from current zone to target
    const path = findPath(currentZone.id, targetZoneId);

    if (path && path.length > 1) {
      // Convert zone IDs to waypoints
      const waypoints = path.map(zoneId =>
        INDOOR_MAP.zones.find(z => z.id === zoneId)
      );
      setCurrentPath(waypoints);
      setNextWaypoint(waypoints[1]); // First waypoint after current position

      // Announce start of navigation
      const targetZone = INDOOR_MAP.zones.find(z => z.id === targetZoneId);
      playTTS(`Navegando para ${targetZone.name}`);
    }
  };

  const checkNavigationInstructions = () => {
    if (!nextWaypoint) return;

    const dx = nextWaypoint.x - position.x;
    const dy = nextWaypoint.y - position.y;
    const distanceToWaypoint = Math.sqrt(dx * dx + dy * dy);

    // If we reached the waypoint, move to next one
    if (distanceToWaypoint < 10) {
      const currentWaypointIndex = currentPath.findIndex(wp => wp.id === nextWaypoint.id);
      if (currentWaypointIndex < currentPath.length - 1) {
        const newWaypoint = currentPath[currentWaypointIndex + 1];
        setNextWaypoint(newWaypoint);
        playTTS(`Chegando em ${newWaypoint.name}`);
      } else {
        // Reached destination
        setNextWaypoint(null);
        setCurrentPath([]);
        setNavigationTarget(null);
        playTTS('Você chegou ao destino');
        return;
      }
    }

    // Calculate angle to waypoint
    const targetAngle = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;
    const currentHeading = headingRef.current;

    // Calculate turn angle
    let turnAngle = targetAngle - currentHeading;
    if (turnAngle > 180) turnAngle -= 360;
    if (turnAngle < -180) turnAngle += 360;

    // Give turn instructions
    const now = Date.now();
    const timeSinceLastInstruction = now - lastInstructionRef.current.time;

    if (timeSinceLastInstruction > 5000) { // Don't spam instructions
      if (Math.abs(turnAngle) > 45) {
        if (turnAngle > 0) {
          if (lastInstructionRef.current.type !== 'right') {
            playTTS('Vire à direita');
            lastInstructionRef.current = { time: now, type: 'right' };
          }
        } else {
          if (lastInstructionRef.current.type !== 'left') {
            playTTS('Vire à esquerda');
            lastInstructionRef.current = { time: now, type: 'left' };
          }
        }
      } else if (Math.abs(turnAngle) < 20 && lastInstructionRef.current.type !== 'straight') {
        playTTS('Continue em frente');
        lastInstructionRef.current = { time: now, type: 'straight' };
      }
    }
  };

  const getDirectionName = (deg) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const getNavigationDirection = () => {
    if (!navigationTarget) return null;

    const targetZone = INDOOR_MAP.zones.find(z => z.id === navigationTarget);
    if (!targetZone) return null;

    const dx = targetZone.x - position.x;
    const dy = targetZone.y - position.y;
    const targetAngle = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;

    const distance = Math.sqrt(dx * dx + dy * dy);

    return {
      angle: Math.round(targetAngle),
      direction: getDirectionName(targetAngle),
      distance: Math.round(distance)
    };
  };

  const handleVisionAssist = async () => {
    try {
      // Check camera permissions
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();
        if (!result.granted) {
          Alert.alert('Permissão Necessária', 'Precisamos de acesso à câmera para ajudá-lo.');
          return;
        }
      }

      // Check audio permissions
      if (!hasAudioPermission) {
        const result = await Audio.requestPermissionsAsync();
        if (result.status !== 'granted') {
          Alert.alert('Permissão Necessária', 'Precisamos de acesso ao microfone para gravar sua pergunta.');
          return;
        }
        setHasAudioPermission(true);
      }

      // Reset states before opening camera
      setIsRecording(false);
      setIsProcessing(false);
      capturedPhotoRef.current = null;
      setRecording(null);

      // Open camera
      setShowCamera(true);
      Speech.speak('Câmera aberta. Toque no botão laranja para tirar foto e iniciar gravação.', { language: 'pt-BR' });
    } catch (error) {
      console.error('Error in handleVisionAssist:', error);
      Alert.alert('Erro', 'Não foi possível abrir a câmera: ' + error.message);
    }
  };

  const takePictureAndStartRecording = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      Speech.speak('Tirando foto. Agora grave sua pergunta.', { language: 'pt-BR' });

      // Take picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      // Store photo for later use
      capturedPhotoRef.current = photo;

      // Start recording audio using expo-av
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();

      setRecording(newRecording);
      setIsRecording(true);
      setIsProcessing(false);

      Speech.speak('Gravando. Faça sua pergunta sobre a imagem.', { language: 'pt-BR' });
    } catch (error) {
      console.error('Error taking picture or starting recording:', error);
      Alert.alert('Erro', 'Não foi possível tirar a foto ou iniciar gravação: ' + error.message);
      setIsProcessing(false);
    }
  };

  const stopRecordingAndProcess = async () => {
    if (!recording) {
      console.log('Cannot stop recording - no active recording');
      return;
    }

    try {
      Speech.speak('Processando sua pergunta...', { language: 'pt-BR' });
      setIsRecording(false);
      setIsProcessing(true);

      // Stop recording and get URI
      const status = await recording.getStatusAsync();
      let recordingUri;

      if (status.isRecording) {
        await recording.stopAndUnloadAsync();
        recordingUri = recording.getURI();
      } else {
        recordingUri = recording.getURI();
      }

      console.log('Recording stopped, URI:', recordingUri);

      if (!recordingUri || !capturedPhotoRef.current) {
        throw new Error('Missing recording or photo');
      }

      // Read audio file as base64
      const audioBase64 = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Read photo as base64
      const photoBase64 = await FileSystem.readAsStringAsync(capturedPhotoRef.current.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Send to Gemini API
      await processWithGemini(photoBase64, audioBase64);

      setShowCamera(false);
      capturedPhotoRef.current = null;
      setRecording(null);

    } catch (error) {
      console.error('Error processing:', error);
      console.error('Error stack:', error.stack);
      Alert.alert('Erro', 'Não foi possível processar sua pergunta: ' + error.message);
      setIsProcessing(false);
    }
  };

  const processWithGemini = async (imageBase64, audioBase64) => {
    try {
      if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
        Alert.alert('Configuração Necessária', 'Por favor, adicione sua chave da API Gemini no código.');
        Speech.speak('Configure sua chave da API Gemini primeiro.', { language: 'pt-BR' });
        setIsProcessing(false);
        return;
      }

      // First API call: Transcribe audio
      console.log('Transcribing audio...');
      const transcribeResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: "Escreva o que o áudio diz. Apenas isso, nenhum texto adicional."
                },
                {
                  inline_data: {
                    mime_type: "audio/m4a",
                    data: audioBase64
                  }
                }
              ]
            }]
          })
        }
      );

      const transcribeData = await transcribeResponse.json();
      console.log('Transcribe response:', JSON.stringify(transcribeData, null, 2));

      if (!transcribeData.candidates || !transcribeData.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('Invalid transcription data:', transcribeData);
        throw new Error(`Invalid transcription response: ${JSON.stringify(transcribeData)}`);
      }

      const transcription = transcribeData.candidates[0].content.parts[0].text;
      console.log('Transcription:', transcription);

      // Second API call: Analyze image with the transcribed question
      console.log('Analyzing image...');
      const analyzeResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: transcription
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: imageBase64
                  }
                }
              ]
            }]
          })
        }
      );

      const analyzeData = await analyzeResponse.json();
      console.log('Analyze response:', JSON.stringify(analyzeData, null, 2));

      if (!analyzeData.candidates || !analyzeData.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('Invalid analysis data:', analyzeData);
        throw new Error(`Invalid analysis response: ${JSON.stringify(analyzeData)}`);
      }

      const geminiResponse = analyzeData.candidates[0].content.parts[0].text;
      console.log('Gemini response:', geminiResponse);

      // Speak the response
      Speech.speak(geminiResponse, {
        language: 'pt-BR',
        rate: 0.9,
      });

      // Show visual feedback
      setAudioInstruction(geminiResponse);
      setTimeout(() => setAudioInstruction(null), 10000);

      setIsProcessing(false);

    } catch (error) {
      console.error('Gemini API error:', error);
      console.error('Error message:', error.message);
      Alert.alert('Erro', 'Não foi possível processar com a IA: ' + error.message);
      Speech.speak('Erro ao processar com a inteligência artificial.', { language: 'pt-BR' });
      setIsProcessing(false);
    }
  };

  const navDir = getNavigationDirection();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Navigation color="#000" size={32} />
          <Text style={styles.title}>Navegação Interna</Text>
        </View>
        <Text style={styles.subtitle}>Caminhe e veja o mapa!</Text>

        {/* Vision Assist Button */}
        <TouchableOpacity
          style={styles.visionAssistButton}
          onPress={handleVisionAssist}
        >
          <CameraIcon color="#fff" size={24} />
          <Text style={styles.visionAssistButtonText}>Assistente Visual</Text>
        </TouchableOpacity>

        {/* Camera View Modal */}
        {showCamera && (
          <View style={styles.cameraModal}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
            />
            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowCamera(false);
                  setIsProcessing(false);
                  setIsRecording(false);
                  capturedPhotoRef.current = null;
                  if (recording) {
                    recording.stopAndUnloadAsync().catch(console.error);
                    setRecording(null);
                  }
                }}
              >
                <Text style={styles.closeButtonText}>✕ Fechar</Text>
              </TouchableOpacity>

              <View style={styles.centerControls}>
                {!isRecording && !isProcessing && (
                  <TouchableOpacity
                    style={styles.captureButton}
                    onPress={takePictureAndStartRecording}
                  >
                    <CameraIcon color="#fff" size={40} />
                    <Text style={styles.captureButtonText}>Tirar Foto e Gravar</Text>
                  </TouchableOpacity>
                )}

                {isRecording && (
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={stopRecordingAndProcess}
                  >
                    <Mic color="#fff" size={40} />
                    <Text style={styles.stopButtonText}>Parar Gravação</Text>
                  </TouchableOpacity>
                )}

                {isProcessing && !isRecording && (
                  <View style={styles.processingIndicator}>
                    <Text style={styles.processingText}>Processando...</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Map Visualization */}
        <View style={styles.card}>
          <Text style={styles.cardTitleLarge}>Planta do Andar</Text>
          <View style={styles.mapContainer}>
            {/* Draw walls */}
            {INDOOR_MAP.walls.map((wall, index) => {
              const x1 = (wall.x1 / 100) * 280;
              const y1 = (wall.y1 / 100) * 220;
              const x2 = (wall.x2 / 100) * 280;
              const y2 = (wall.y2 / 100) * 220;

              const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
              const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

              return (
                <View
                  key={`wall-${index}`}
                  style={[
                    styles.wall,
                    {
                      left: x1,
                      top: y1,
                      width: length,
                      transform: [{ rotate: `${angle}deg` }],
                    }
                  ]}
                />
              );
            })}

            {/* Draw path */}
            {currentPath.length > 1 && currentPath.map((waypoint, index) => {
              if (index === 0) return null;

              const prevWaypoint = currentPath[index - 1];
              const x1 = (prevWaypoint.x / 100) * 280;
              const y1 = (prevWaypoint.y / 100) * 220;
              const x2 = (waypoint.x / 100) * 280;
              const y2 = (waypoint.y / 100) * 220;

              const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
              const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

              return (
                <View
                  key={`path-${index}`}
                  style={[
                    styles.pathLine,
                    {
                      left: x1,
                      top: y1,
                      width: length,
                      transform: [{ rotate: `${angle}deg` }],
                    }
                  ]}
                />
              );
            })}

            {/* Draw zone circles */}
            {INDOOR_MAP.zones.map(zone => {
              const left = (zone.x / 100) * 280;
              const top = (zone.y / 100) * 220;
              const isCurrent = zone.id === currentZone.id;
              const isTarget = zone.id === navigationTarget;

              return (
                <View
                  key={zone.id}
                  style={[
                    styles.zoneCircle,
                    { left: left - 15, top: top - 15 },
                    isCurrent && styles.zoneCircleCurrent,
                    isTarget && styles.zoneCircleTarget
                  ]}
                >
                  <Text style={styles.zoneLabel}>{zone.name.slice(0, 3)}</Text>
                </View>
              );
            })}

            {/* User position with larger heading indicator */}
            <View
              style={[
                styles.userMarker,
                {
                  left: (position.x / 100) * 280 - 28,
                  top: (position.y / 100) * 220 - 28,
                }
              ]}
            >
              <View style={[styles.userDot, isWalking && styles.userDotWalking]}>
                <View
                  style={[
                    styles.headingIndicator,
                    { transform: [{ rotate: `${heading}deg` }] }
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Wall Warning */}
        {wallWarning && (
          <View style={styles.wallWarning}>
            <Text style={styles.wallWarningText}>{wallWarning}</Text>
          </View>
        )}

        {/* Audio Instruction */}
        {audioInstruction && (
          <View style={styles.audioInstruction}>
            <Text style={styles.audioInstructionText}>🔊 {audioInstruction}</Text>
          </View>
        )}

        {/* Current Location */}
        <View style={styles.currentLocation}>
          <View style={styles.locationHeader}>
            <MapPin color={isWalking ? '#ff8c42' : '#ff6b35'} size={24} />
            <Text style={styles.locationName}>{currentZone.name}</Text>
          </View>
          <Text style={styles.locationDescription}>{currentZone.description}</Text>
        </View>

        {/* Heading & Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Direção</Text>
            <View style={styles.compassContainer}>
              <Compass color="#ff6b35" size={20} />
              <Text style={styles.statValue}>{getDirectionName(heading)}</Text>
            </View>
            <Text style={styles.statHint}>{heading}°</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Passos</Text>
            <Text style={styles.statValue}>{stepCount}</Text>
            <Text style={styles.statHint}>{isWalking ? 'Caminhando...' : 'Parado'}</Text>
          </View>
        </View>

        {/* Navigation */}
        <View style={styles.card}>
          <View style={styles.navHeader}>
            <Compass color="#000" size={20} />
            <Text style={styles.cardTitleLarge}>Navegar Para:</Text>
          </View>
          {navDir && (
            <View style={styles.navInstruction}>
              <Text style={styles.navInstructionText}>
                Vá para {navDir.direction} por ~{navDir.distance}m
              </Text>
            </View>
          )}
          <View style={styles.buttonGrid}>
            {INDOOR_MAP.zones.filter(z => z.id !== currentZone.id).map(zone => (
              <TouchableOpacity
                key={zone.id}
                onPress={() => startNavigation(zone.id)}
                style={[
                  styles.navButton,
                  navigationTarget === zone.id && styles.navButtonActive
                ]}
              >
                <Text style={styles.navButtonText}>{zone.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff5e6',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#8b4513',
    marginBottom: 24,
  },
  currentLocation: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ff6b35',
    shadowColor: '#ff6b35',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  locationName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  locationDescription: {
    fontSize: 16,
    color: '#5a3a1a',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd4a3',
    shadowColor: '#ff8c42',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#8b4513',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  statHint: {
    fontSize: 10,
    color: '#a0522d',
    marginTop: 4,
  },
  compassContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffd4a3',
    shadowColor: '#ff8c42',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    color: '#8b4513',
    marginBottom: 8,
  },
  cardTitleLarge: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navInstruction: {
    backgroundColor: '#ff6b35',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  navInstructionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navButton: {
    backgroundColor: '#ffd4a3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: '47%',
    borderWidth: 1,
    borderColor: '#ffb366',
  },
  navButtonActive: {
    backgroundColor: '#ff6b35',
    borderColor: '#ff6b35',
  },
  navButtonText: {
    color: '#000',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  mapContainer: {
    width: '100%',
    height: 240,
    backgroundColor: '#ffe4c4',
    borderRadius: 8,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#ffd4a3',
    overflow: 'hidden',
  },
  wall: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#8b4513',
    transformOrigin: 'left center',
  },
  pathLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#4a90e2',
    transformOrigin: 'left center',
    opacity: 0.7,
  },
  zoneCircle: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffd4a3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffb366',
  },
  zoneCircleCurrent: {
    backgroundColor: '#ff6b35',
    borderColor: '#ff8c42',
  },
  zoneCircleTarget: {
    backgroundColor: '#4a90e2',
    borderColor: '#5ba3f5',
  },
  zoneLabel: {
    fontSize: 8,
    color: '#000',
    fontWeight: 'bold',
  },
  userMarker: {
    position: 'absolute',
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ff6b35',
    borderWidth: 3,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDotWalking: {
    backgroundColor: '#ff8c42',
  },
  headingIndicator: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#000',
    position: 'absolute',
    top: -25,
  },
  navArrow: {
    position: 'absolute',
  },
  navArrowText: {
    fontSize: 30,
    color: '#4a90e2',
    fontWeight: 'bold',
  },
  wallWarning: {
    backgroundColor: '#ff4444',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#cc0000',
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  wallWarningText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  audioInstruction: {
    backgroundColor: '#4a90e2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#357abd',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  audioInstructionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  visionAssistButton: {
    backgroundColor: '#9b59b6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#9b59b6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  visionAssistButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cameraModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 20,
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  captureButton: {
    alignSelf: 'center',
    backgroundColor: '#ff6b35',
    padding: 20,
    borderRadius: 50,
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stopButton: {
    alignSelf: 'center',
    backgroundColor: '#e74c3c',
    padding: 20,
    borderRadius: 50,
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    borderWidth: 3,
    borderColor: '#fff',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  processingIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 12,
  },
  processingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default BeaconNavigationMock;
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View, ScrollView } from 'react-native'
import { Camera, CameraCapturedPicture, CameraView as ExpoCameraComponent } from 'expo-camera'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system/legacy'

import {
    GoogleGenAI,
    createUserContent,
    createPartFromUri,
} from "@google/genai";

type Props = {
    /** Optional endpoint to POST the recorded audio file for transcription. Receives form-data with key 'file'. Should return JSON { text: string } */
    transcribeEndpoint?: string
    /** Callback called when both transcription and photo are available */
    onResult?: (result: { transcription: string; photoUri: string; audioUri?: string; geminiResponse?: string }) => void
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY || "" });

export default function VoicePhotoRecorder({ transcribeEndpoint, onResult }: Props) {
    // Workaround for some environments where the imported Camera object is a module
    // namespace (with a default export). Try common fallbacks so the JSX element
    // resolves to a callable/component:
    const CameraView: any = ExpoCameraComponent
    const cameraRef = useRef<any | null>(null)
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null)
    const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null)
    const [recording, setRecording] = useState<any | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [photoUri, setPhotoUri] = useState<string | null>(null)
    const [transcription, setTranscription] = useState<string | null>(null)
    const [audioUri, setAudioUri] = useState<string | null>(null)
    const [geminiResponse, setGeminiResponse] = useState<string | null>(null)

    useEffect(() => {
        ; (async () => {
            const camera = await Camera.requestCameraPermissionsAsync()
            setHasCameraPermission(camera.status === 'granted')

            const audio = await Audio.requestPermissionsAsync()
            setHasAudioPermission(audio.status === 'granted')
        })()
    }, [])

    const startRecording = async () => {
        if (!hasAudioPermission) {
            Alert.alert('Permissão de áudio necessária', 'Por favor permita o acesso ao microfone nas configurações.')
            return
        }

        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            })

            const recording = new Audio.Recording()
            // Some expo-av TypeScript typings vary between versions. Use a permissive any cast for the preset.
            const preset: any = (Audio as any).RECORDING_OPTIONS_PRESET_HIGH_QUALITY || (Audio as any).RecordingOptionsPresets?.HIGH_QUALITY || {}
            await recording.prepareToRecordAsync(preset)
            await recording.startAsync()
            setRecording(recording)
            setAudioUri(null)
            setTranscription(null)
            setPhotoUri(null)
            setGeminiResponse(null)
        } catch (error) {
            console.error('Erro ao iniciar gravação', error)
            Alert.alert('Erro', 'Não foi possível iniciar a gravação.')
        }
    }

    const stopRecordingAndCapture = async () => {
        if (!recording) return
        setIsProcessing(true)
        try {
            await recording.stopAndUnloadAsync()
            const uri = recording.getURI()
            setAudioUri(uri ?? null)

            // Take picture after stopping the recording
            let photo: CameraCapturedPicture | null = null
            if (cameraRef.current) {
                photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false })
                setPhotoUri(photo?.uri ?? null)
            }

            // Transcribe audio (if endpoint provided)
            let text = 'Transcrição não disponível (nenhum endpoint configurado)'
            if (uri && transcribeEndpoint) {
                try {
                    text = await transcribeAudio(uri)
                    setTranscription(text)
                } catch (err) {
                    console.error('Transcription error', err)
                    setTranscription('Erro ao transcrever o áudio')
                }
            } else if (uri) {
                try {
                    text = await transcribeAudio(uri)
                    setTranscription(text)
                } catch (err) {
                    console.error('Transcription error', err)
                    setTranscription('Erro ao transcrever o áudio')
                    text = 'Erro ao transcrever o áudio'
                }
            }

            // Send to Gemini for analysis
            let geminiAnswer = ''
            if (photo?.uri && text && text !== 'Erro ao transcrever o áudio') {
                try {
                    geminiAnswer = await analyzeWithGemini(text, photo.uri)
                    setGeminiResponse(geminiAnswer)
                } catch (err) {
                    console.error('Gemini analysis error', err)
                    setGeminiResponse('Erro ao analisar com Gemini')
                    geminiAnswer = 'Erro ao analisar com Gemini'
                }
            }

            // Callback with results
            onResult?.({ 
                transcription: text, 
                photoUri: photo?.uri ?? '', 
                audioUri: uri ?? undefined,
                geminiResponse: geminiAnswer 
            })
        } catch (error) {
            console.error('Erro ao parar gravação / tirar foto', error)
            Alert.alert('Erro', 'Ocorreu um erro ao processar a gravação/foto.')
        } finally {
            setRecording(null)
            setIsProcessing(false)
        }
    }

    /**
     * Uploads the audio file to the configured endpoint.
     * The endpoint should accept multipart/form-data with field 'file' and return JSON { text: string }.
     * This function is intentionally generic so you can point it to your Whisper/OpenAI proxy or any transcription service.
     */
    async function transcribeAudio(localUri: string): Promise<string> {
        const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
        const contents = [
            { text: "Escreva o que o áudio diz. Apenas isso, nenhum texto adicional." },
            {
                inlineData: {
                    mimeType: "audio/m4a",
                    data: base64,
                },
            },
        ];

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
        });
        console.log(response.text);
        return response.text || "";
    }

    /**
     * Sends the transcription and photo to Gemini for analysis
     */
    async function analyzeWithGemini(question: string, photoUri: string): Promise<string> {
        const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 })
        const contents = [
            { text: question },
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64,
                },
            },
        ];
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
        });
        console.log('Gemini response:', response.text);
        return response.text || "";
    }

    if (hasCameraPermission === null || hasAudioPermission === null) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
                <Text>Solicitando permissões...</Text>
            </View>
        )
    }

    if (!hasCameraPermission) {
        return (
            <View style={styles.center}>
                <Text>Permissão de câmera negada.</Text>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <CameraView style={styles.camera} ref={(c: any) => (cameraRef.current = c)} />

            <View style={styles.overlay} pointerEvents="box-none">
                <Pressable
                    onPressIn={startRecording}
                    onPressOut={stopRecordingAndCapture}
                    style={styles.recordButtonContainer}
                >
                    <View style={[styles.recordButton, recording ? styles.recording : null]} />
                    <Text style={styles.hint}>Segure para gravar</Text>
                </Pressable>

                {isProcessing && (
                    <View style={styles.processing}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.processingText}>Processando...</Text>
                    </View>
                )}

                {photoUri && (
                    <View style={styles.preview}>
                        <Image source={{ uri: photoUri }} style={styles.previewImage} />
                        <Text style={styles.previewText}>Foto capturada</Text>
                    </View>
                )}

                {transcription && (
                    <View style={styles.transcriptionBox}>
                        <Text style={styles.transcriptionTitle}>Pergunta</Text>
                        <Text style={styles.transcriptionText}>{transcription}</Text>
                    </View>
                )}

                {geminiResponse && (
                    <ScrollView style={styles.responseBox} contentContainerStyle={styles.responseContent}>
                        <Text style={styles.responseTitle}>Resposta</Text>
                        <Text style={styles.responseText}>{geminiResponse}</Text>
                    </ScrollView>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },
    overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    recordButtonContainer: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        alignItems: 'center',
    },
    recordButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderWidth: 4,
        borderColor: 'rgba(0,0,0,0.3)',
    },
    recording: { backgroundColor: '#ff4d4d' },
    hint: { marginTop: 8, color: '#fff', fontSize: 12 },
    processing: {
        position: 'absolute',
        top: 40,
        alignSelf: 'center',
        alignItems: 'center',
    },
    processingText: { color: '#fff', marginTop: 4 },
    preview: { position: 'absolute', left: 14, top: 40, alignItems: 'center' },
    previewImage: { width: 80, height: 120, borderRadius: 6, backgroundColor: '#222' },
    previewText: { color: '#fff', fontSize: 12, marginTop: 6 },
    transcriptionBox: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 240,
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 10,
        borderRadius: 8,
    },
    transcriptionTitle: { color: '#fff', fontWeight: '600', marginBottom: 6 },
    transcriptionText: { color: '#fff' },
    responseBox: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 140,
        maxHeight: 90,
        backgroundColor: 'rgba(34,139,34,0.8)',
        borderRadius: 8,
    },
    responseContent: {
        padding: 10,
    },
    responseTitle: { color: '#fff', fontWeight: '600', marginBottom: 6 },
    responseText: { color: '#fff', fontSize: 14 },
})
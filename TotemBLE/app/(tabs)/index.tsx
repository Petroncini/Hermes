// navigator.tsx

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Button, Platform, Alert, PermissionsAndroid } from 'react-native';
// import { Buffer } from 'buffer'; // <-- MUDANÇA: Não precisamos mais disto
import { BleManager, Device, State, BleError, Subscription, ScanMode } from 'react-native-ble-plx';
// import * as FileSystem from 'expo-file-system'; // (Você não estava usando isso)
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// MUDANÇA: Importa a rota atualizada (sem MY_BEACON_UUID)
import { HAPPY_ROUTE, ARRIVAL_THRESHOLD_RSSI, CALIBRATED_TX_POWER, ENVIRONMENT_FACTOR } from '../../happy_route';

// --- MUDANÇA: Todas as funções de parsing de iBeacon foram removidas ---
// function hexFromBase64(...) {}
// function parseIBeacon(...) {}

// Map RSSI (-100 .. -30) to beep interval (ms) — closer = faster beep
// (Sua função original - mantida)
function rssiToIntervalMs(rssi: number | null) {
    if (rssi === null || rssi === undefined) return 1500;
    const clamped = Math.max(-100, Math.min(-30, rssi));
    const ratio = (clamped - -100) / (-30 - -100); // 0..1
    const min = 120; // fastest (ms)
    const max = 1400; // slowest (ms)
    return Math.round(max - ratio * (max - min));


}
function rssiToMeters(rssi: number | null): number {
    if (rssi === null) return -1; // -1 = Desconhecido

    const ratio = rssi / CALIBRATED_TX_POWER;
    if (ratio < 1.0) {
        return Math.pow(ratio, 10);
    } else {
        const distance = Math.pow(10, (CALIBRATED_TX_POWER - rssi) / (10 * ENVIRONMENT_FACTOR));
        return distance;
    }
}

export default function BeaconGuide() {
    const managerRef = useRef(new BleManager());
    const [scanning, setScanning] = useState(false);

    // MUDANÇA: O estado 'nearest' agora armazena o UUID
    const [nearest, setNearest] = useState<{ uuid: string; rssi: number } | null>(null);

    const [targetIndex, setTargetIndex] = useState(0);
    const [arrived, setArrived] = useState(false);
    const [hasPermissions, setHasPermissions] = useState(false); // MUDANÇA: Estado de permissão
    const [bleState, setBleState] = useState<State>(State.Unknown);

    const beepSoundRef = useRef<Audio.Sound | null>(null);
    const beepTimerRef = useRef<number | null>(null); // MUDANÇA: Tipo correto para timer
    const scanSubscription = useRef<Subscription | null>(null); // MUDANÇA: Ref para o scan

    // MUDANÇA: Lógica de permissão robusta para Android 12+
    async function requestBlePermissions(): Promise<boolean> {
        if (Platform.OS !== 'android') {
            return true;
        }

        if (Platform.Version >= 31) { // Android 12+
            const result = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            return (
                result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
                result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
            );
        }

        // Android 11 e abaixo
        const locResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return locResult === PermissionsAndroid.RESULTS.GRANTED;
    };

    useEffect(() => {
        const manager = managerRef.current;

        // Assina o estado do Bluetooth
        const stateSub = manager.onStateChange((state) => {
            setBleState(state);
            if (state === State.PoweredOff) {
                Alert.alert('Bluetooth Desligado', 'Por favor, ligue seu Bluetooth.');
                stopScan();
            }
        }, true);

        // Pede permissões
        requestBlePermissions().then(granted => {
            setHasPermissions(granted);
            if (!granted) {
                Alert.alert('Permissão necessária', 'É preciso permitir localização e Bluetooth para escanear beacons.');
            }
        });

        return () => {
            // cleanup
            stateSub.remove();
            stopScan();
            manager.destroy();
            beepSoundRef.current?.unloadAsync();
            if (beepTimerRef.current) clearTimeout(beepTimerRef.current);
        };
    }, []);

    // (Sua lógica original do "Geiger counter" - mantida)
    useEffect(() => {
        if (beepTimerRef.current) {
            clearTimeout(beepTimerRef.current);
            beepTimerRef.current = null;
        }

        if (!nearest || !scanning) return; // MUDANÇA: Só bipa se estiver escaneando
        let isCancelled = false;

        // O CÓDIGO CORRIGIDO
        async function playLoop() {
            if (isCancelled) return;
            try {
                if (!beepSoundRef.current) {
                    const { sound } = await Audio.Sound.createAsync(require('../../assets/beep.mp3'));
                    beepSoundRef.current = sound;
                }
                const s = beepSoundRef.current!;

                // --- A MUDANÇA ESTÁ AQUI ---
                // 1. Para o som anterior (se estiver tocando)
                await s.stopAsync();
                // 2. Toca o som de novo, mas NÃO espere (remova o 'await')
                s.playFromPositionAsync(0);
                // --- FIM DA MUDANÇA ---

            } catch (e) {
                // ignore
            }

            // O setTimeout agora é a única coisa que controla o intervalo
            const nextMs = rssiToIntervalMs(nearest!.rssi);
            beepTimerRef.current = setTimeout(playLoop, nextMs);
        }

        playLoop();

        return () => {
            isCancelled = true;
            if (beepTimerRef.current) {
                clearTimeout(beepTimerRef.current);
                beepTimerRef.current = null;
            }
        };
    }, [nearest, scanning]); // MUDANÇA: Reage ao 'scanning' tbm

    // (Sua lógica de "Chegada" - atualizada para usar UUID)
    useEffect(() => {
        if (!nearest) return;
        const currentTarget = HAPPY_ROUTE[targetIndex];
        if (!currentTarget) return;

        // MUDANÇA: Checa por UUID em vez de MINOR
        if (nearest.uuid.toLowerCase() === currentTarget.uuid.toLowerCase() && nearest.rssi >= ARRIVAL_THRESHOLD_RSSI) {

            if (arrived) return; // Previne disparo duplo

            setArrived(true);
            Speech.speak(currentTarget.arrivalInstruction);

            const next = targetIndex + 1;
            setTimeout(() => {
                if (next < HAPPY_ROUTE.length) {
                    setTargetIndex(next);
                    setNearest(null); // Reseta o 'nearest'
                    setArrived(false);
                    Speech.speak(`${HAPPY_ROUTE[next].findInstruction}`);
                    // MUDANÇA: Inicia o scan para o próximo alvo
                    scanForLandmark(HAPPY_ROUTE[next].uuid);
                } else {
                    Speech.speak('Rota finalizada. Obrigado.');
                    stopScan();
                }
            }, 2000);
        }
    }, [nearest]);

    // MUDANÇA: A função de scan agora é direcionada
    function scanForLandmark(targetUuid: string) {
        const manager = managerRef.current;
        if (scanSubscription.current) {
            scanSubscription.current.remove(); // Para o scan anterior
        }

        const uuidToScan = targetUuid.toLowerCase();

        manager.startDeviceScan(
            [uuidToScan],
            {
                allowDuplicates: true,
                // MUDANÇA 2: Pede ao Android para escanear com mais frequência
                scanMode: ScanMode.LowLatency
            },
            (error, device) => {

                // ... (resto do código) ...

                if (!device || !device.rssi) return;

                // ... (resto do código) ...

                const rssi = device.rssi;

                // Aplicando a Correção 1:
                setNearest({ uuid: uuidToScan, rssi: rssi });
            });
    }

    // MUDANÇA: Os botões agora controlam a ROTA, não só o scan
    function startRoute() {
        if (!hasPermissions || bleState !== State.PoweredOn) {
            Alert.alert("Erro", "Por favor, ative as permissões e o Bluetooth.");
            return;
        }
        setScanning(true);
        setTargetIndex(0);
        setNearest(null);
        setArrived(false);
        const firstTarget = HAPPY_ROUTE[0];
        Speech.speak(`Rota iniciada. Vá em direção a ${firstTarget.name}. ${firstTarget.findInstruction}`);
        scanForLandmark(firstTarget.uuid);
    }

    function stopScan() {
        try {
            managerRef.current.stopDeviceScan();
            if (scanSubscription.current) {
                scanSubscription.current.remove();
            }
        } catch (e) {
            // ignore
        }
        setScanning(false);
        setNearest(null);
        if (beepTimerRef.current) clearTimeout(beepTimerRef.current);
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Beacon Guide (MVP)</Text>
            <Text style={styles.instructions}>Alvo atual: {HAPPY_ROUTE[targetIndex + 1]?.name ?? '—'}</Text>
            <Text style={styles.instructions}>{HAPPY_ROUTE[targetIndex]?.findInstruction}</Text>

            <View style={{ height: 12 }} />

            {/* MUDANÇA: Mostra o UUID parcial (ex: "aaaa") */}
            <Text style={styles.instructions}>Leitura mais próxima: {nearest ? `a ${rssiToMeters(nearest.rssi).toFixed(2)} m` : 'nenhuma'}</Text>
            <Text style={styles.instructions}>{arrived ? 'Chegou! seguindo pro próximo...' : ''}</Text>

            <View style={{ height: 12 }} />

            {/* MUDANÇA: Os botões agora controlam a rota */}
            <Button
                title={scanning ? 'Parar Rota' : 'Iniciar Rota'}
                onPress={() => (scanning ? stopScan() : startRoute())}
                disabled={!hasPermissions || bleState !== State.PoweredOn}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, justifyContent: 'flex-start' },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#fff' },
    instructions: { marginBottom: 6, color: '#fff' },
});
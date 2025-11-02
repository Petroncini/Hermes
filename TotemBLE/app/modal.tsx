import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import VoicePhotoRecorder from './voice-photo-recorder';

export default function ModalScreen() {
  return (
    <VoicePhotoRecorder
      transcribeEndpoint="https://sua-api.com/transcribe" // opcional
      onResult={({ transcription, photoUri, audioUri }) => {
        console.log('Texto:', transcription)
        console.log('Foto URI:', photoUri)
        console.log('Áudio URI:', audioUri)
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});

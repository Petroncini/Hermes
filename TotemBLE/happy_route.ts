// happyRoute.ts

export interface Landmark {
  uuid: string; // <-- Mudamos de 'minor' para 'uuid'
  name: string;
  findInstruction: string;
  arrivalInstruction: string;
}

export const HAPPY_ROUTE: Landmark[] = [
  {
    // Coloque o UUID em minúsculo aqui para facilitar a comparação
    uuid: '0000aaaa-0000-1000-8000-00805f9b34fb', 
    name: "Entrada",
    findInstruction: "Bem-vindo à Entrada. Agora, encontre a Interseção do Corredor.",
    arrivalInstruction: "Você chegou à Entrada. Agora, encontre a Interseção do Corredor.",
  },
  {
    uuid: '0000bbbb-0000-1000-8000-00805f9b34fb',
    name: "Interseção do Corredor",
    findInstruction: "Você está na Interseção do Corredor. Agora, encontre a Porta do Banheiro.",
    arrivalInstruction: "Ótimo. Você está na Interseção do Corredor. Agora, encontre a Porta do Banheiro.",
  },
  {
    uuid: '0000cccc-0000-1000-8000-00805f9b34fb',
    name: "Porta do Banheiro",
    findInstruction: "Você está na Porta do Banheiro. Seu destino está à direita.",
    arrivalInstruction: "Você chegou à Porta do Banheiro. Seu destino está à direita.",
  },
];

// NÃO PRECISAMOS MAIS DO MY_BEACON_UUID
export const ARRIVAL_THRESHOLD_RSSI: number = -65;
export const CALIBRATED_TX_POWER: number = -70;
export const ENVIRONMENT_FACTOR: number = 2.5;
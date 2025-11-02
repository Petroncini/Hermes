# 🛠️ Protótipos de Acessibilidade e Posicionamento

Este repositório reúne **dois protótipos móveis desenvolvidos em React Native**, voltados a soluções de **posicionamento e acessibilidade em ambientes internos**.

- **🧭 HermesWayfinderDEMO** — Navegação acessível com sensores do smartphone e IA Gemini  
- **📡 TotemBLE** — Estimativa de distância via Bluetooth Low Energy (BLE) e RSSI

---

## 🧭 HermesWayfinderDEMO — Navegação Interna Acessível

### 🎯 Visão Geral
O **HermesWayfinderDEMO** é um aplicativo protótipo que auxilia **pessoas cegas ou com baixa visão** a se orientarem em locais como shoppings, aeroportos e escritórios.  
Ele integra sensores do smartphone (acelerômetro, magnetômetro e câmera) com **síntese de fala** e a **API Gemini (Google AI)** para criar uma experiência de navegação **interativa e inclusiva**.

### 💡 Cenário de Uso
Ideal para navegação em **ambientes internos** onde o GPS convencional não funciona adequadamente.

### 🚀 Funcionalidades
- **Navegação por voz:** instruções de direção em tempo real  
- **Detecção de passos:** uso do acelerômetro para estimar deslocamento  
- **Bússola integrada:** orientação espacial com o magnetômetro  
- **Assistente visual com IA:** tire uma foto e pergunte sobre o ambiente — a IA Gemini responde por voz  
- **Mapa interno simulado:** representação de zonas e conexões entre áreas  
- **Síntese de fala (TTS):** todas as mensagens narradas em português  

### ⚙️ Instalação e Configuração

**Pré-requisitos**
- Node.js ≥ 18  
- Expo CLI  
- Dispositivo físico com sensores (câmera, microfone, bússola e acelerômetro)  
- Chave de API do Google Gemini  

**Passos**
```bash
git clone https://github.com/seu-usuario/navegacao-interna-visual.git
cd navegacao-interna-visual/HermesWayfinderDEMO
npm install
```

Edite o arquivo principal e substitua `SUA_CHAVE_AQUI` pela sua **chave de API Gemini**, então execute:
```bash
npx expo start
```
Use o **Expo Go** no celular para testar o aplicativo.

---

## 📡 TotemBLE — Localização via Bluetooth RSSI

### 🎯 Visão Geral
O **TotemBLE** demonstra como usar **Bluetooth Low Energy (BLE)** e o **Received Signal Strength Indicator (RSSI)** para **estimar a distância** entre um smartphone e um dispositivo BLE (beacon ou totem).  
Essa técnica é uma base essencial para **posicionamento interno de alta precisão**.

### 🔬 Propósito
Coletar e processar o RSSI para aplicar modelos de atenuação e calcular uma **distância estimada**, oferecendo uma alternativa ao GPS em ambientes fechados.

### ⚠️ Compilação Nativa Necessária
Devido ao uso direto do BLE, este projeto **não roda com o Expo Go**.  
É necessária a **compilação nativa Android** com o SDK devidamente configurado.

### ⚙️ Instalação e Configuração

**Pré-requisitos**
- Node.js ≥ 18  
- Expo CLI  
- React Native CLI (`npm install -g react-native-cli`)  
- Android SDK configurado (Java/JDK, variáveis de ambiente, etc.)

**Passos**
```bash
npm i
npx expo prebuild
npx expo run:android
npx expo start
```

> Se ocorrerem erros de compilação, revise a configuração do Android SDK e as variáveis de ambiente (como `JAVA_HOME`).

---

## 📁 Estrutura do Repositório
```
navegacao-interna-visual/
├── HermesWayfinderDEMO/   # Navegação acessível com IA e sensores
│   ├── ...
├── TotemBLE/              # Localização via BLE RSSI (requer build nativo)
│   ├── android/
│   ├── ...
└── README.md              # Este arquivo
```

---

## 🧩 Créditos
Protótipos desenvolvidos como parte de iniciativas de **acessibilidade e inclusão digital**, explorando sensores móveis e inteligência artificial para navegação assistida em interiores.
````



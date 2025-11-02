# 🧭 Navegação Interna com Assistente Visual

Aplicativo de navegação interna para pessoas com deficiência visual, com assistente de visão alimentado por IA.

## 🌟 Funcionalidades

### Navegação Interna
- **Mapa interativo** com visualização de zonas e paredes
- **Detecção de movimento** usando acelerômetro
- **Bússola** para direcionamento
- **Navegação guiada** com instruções de voz
- **Avisos de parede** para evitar colisões
- **Instruções em português** ("Vire à esquerda", "Vire à direita", etc.)

### Assistente Visual com IA 📸🎤
- **Tire uma foto** do ambiente
- **Grave uma pergunta** em áudio sobre a imagem
- **IA Gemini** transcreve o áudio e analisa a imagem
- **Resposta falada** descrevendo o que está na foto
- Otimizado para acessibilidade visual

## 🚀 Como Usar

### 1. Instalação
```bash
npm install
```

### 2. Configure a API do Gemini

1. Obtenha sua chave de API gratuita em: [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Abra o arquivo `App.js`
3. Encontre a linha `const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';`
4. Substitua `'YOUR_GEMINI_API_KEY'` pela sua chave real

```javascript
const GEMINI_API_KEY = 'SUA_CHAVE_AQUI';
```

### 3. Execute o Aplicativo
```bash
npx expo start
```

Escaneie o QR code com o aplicativo Expo Go no seu celular.

## 📱 Como Usar o Assistente Visual

1. Toque no botão **"Assistente Visual"** (roxo com ícone de câmera)
2. Permita acesso à câmera e microfone quando solicitado
3. A câmera abrirá - aponte para o que deseja identificar
4. Toque em **"Tirar Foto e Gravar"**
5. Após tirar a foto, **faça sua pergunta** sobre a imagem
   - Exemplos: "O que tem nesta foto?", "Que objeto é este?", "Tem algum texto aqui?"
6. Toque em **"Parar Gravação"**
7. Aguarde o processamento
8. Ouça a resposta falada e veja o texto na tela

## 🎯 Casos de Uso

- **Leitura de placas e sinalizações**
- **Identificação de objetos**
- **Descrição de ambientes**
- **Leitura de texto** (cardápios, etiquetas, documentos)
- **Navegação em ambientes desconhecidos**
- **Identificação de obstáculos**

## 🔧 Tecnologias

- React Native + Expo
- Expo Camera
- Expo Speech (TTS)
- Expo Audio (gravação)
- Expo Sensors (acelerômetro, magnetômetro)
- Google Gemini 1.5 Flash API
- Lucide React Native (ícones)

## 📝 Notas

- O aplicativo funciona melhor em dispositivos físicos (não emuladores)
- Requer permissões de câmera, microfone e sensores
- A API Gemini tem limites de uso gratuito - consulte a documentação do Google
- Para melhor qualidade de voz, use em ambiente silencioso

## 🌐 Idioma

Interface e instruções de voz em **Português Brasileiro** 🇧🇷

## 📄 Licença

MIT

const BotiumConnectorBsp = require('./src/connector')

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorBsp,
  PluginDesc: {
    name: 'Speech Synthesis & Recognition',
    provider: 'Botium',
    features: {
      audioInput: true
    },
    capabilities: [
      {
        name: 'BSP_STT',
        label: 'Speech Recognition Profile',
        type: 'speechrecognitionprofile',
        required: false
      },
      {
        name: 'BSP_TTS',
        label: 'Speech Synthesis Profile',
        type: 'speechsynthesisprofile',
        required: false
      }
    ]
  }
}

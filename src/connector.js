const _ = require('lodash')
const axios = require('axios').default
const FormData = require('form-data')
const debug = require('debug')('botium-connector-bsp')

const Capabilities = {
  BSP_STT_URL: 'BSP_STT_URL',
  BSP_STT_PARAMS: 'BSP_STT_PARAMS',
  BSP_STT_METHOD: 'BSP_STT_METHOD',
  BSP_STT_BODY: 'BSP_STT_BODY',
  BSP_STT_HEADERS: 'BSP_STT_HEADERS',
  BSP_STT_TIMEOUT: 'BSP_STT_TIMEOUT',
  BSP_TTS_URL: 'BSP_TTS_URL',
  BSP_TTS_PARAMS: 'BSP_TTS_PARAMS',
  BSP_TTS_METHOD: 'BSP_TTS_METHOD',
  BSP_TTS_BODY: 'BSP_TTS_BODY',
  BSP_TTS_HEADERS: 'BSP_TTS_HEADERS',
  BSP_TTS_VOICE: 'BSP_TTS_VOICE',
  BSP_TTS_APIKEY: 'BSP_TTS_APIKEY',
  BSP_TTS_TIMEOUT: 'BSP_TTS_TIMEOUT'
}

const Defaults = {
  BSP_STT_METHOD: 'POST',
  BSP_STT_TIMEOUT: 10000,
  BSP_TTS_METHOD: 'GET',
  BSP_TTS_TIMEOUT: 10000
}

class BotiumConnectorBsp {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = Object.assign({}, Defaults, caps)

    this.axiosStt = null
    this.axiosTts = null
  }

  async Validate () {
    if (this.caps.BSP_STT_URL) {
      this.axiosStt = axios.create({
        url: this.caps.BSP_STT_URL,
        params: this._getParams(Capabilities.BSP_STT_PARAMS),
        method: this.caps.BSP_STT_METHOD,
        timeout: this.caps.BSP_STT_TIMEOUT,
        headers: this._getHeaders(Capabilities.BSP_STT_HEADERS),
        data: this._getBody(Capabilities.BSP_STT_BODY)
      })
      try {
        const { data } = await this.axiosStt(this._getAxiosUrl(this.caps.BSP_STT_URL, '/api/status'))
        if (data && data.status === 'OK') {
          debug(`Checking STT Status response: ${this._getAxiosShortenedOutput(data)}`)
        } else {
          throw new Error(`Checking STT Status failed, response is: ${this._getAxiosShortenedOutput(data)}`)
        }
      } catch (err) {
        throw new Error(`Checking STT Status failed - ${this._getAxiosErrOutput(err)}`)
      }
    }
    if (this.caps.BSP_TTS_URL) {
      this.axiosTts = axios.create({
        url: this.caps.BSP_TTS_URL,
        params: this._getParams(Capabilities.BSP_TTS_PARAMS),
        method: this.caps.BSP_TTS_METHOD,
        timeout: this.caps.BSP_TTS_TIMEOUT,
        headers: this._getHeaders(Capabilities.BSP_TTS_HEADERS),
        data: this._getBody(Capabilities.BSP_TTS_BODY)
      })
      try {
        const { data } = await this.axiosTts(this._getAxiosUrl(this.caps.BSP_TTS_URL, '/api/status'))
        if (data && data.status === 'OK') {
          debug(`Checking TTS Status response: ${this._getAxiosShortenedOutput(data)}`)
        } else {
          throw new Error(`Checking TTS Status failed, response is: ${this._getAxiosShortenedOutput(data)}`)
        }
      } catch (err) {
        throw new Error(`Checking TTS Status failed - ${this._getAxiosErrOutput(err)}`)
      }
    }
  }

  async UserSays (msg) {
    if (!msg.attachments) {
      msg.attachments = []
    }
    let audioBuffer = null

    if (msg.media && msg.media.length > 0) {
      const media = msg.media[0]
      if (!media.buffer) {
        throw new Error(`Media attachment ${media.mediaUri} not downloaded`)
      }
      if (!media.mimeType || !media.mimeType.startsWith('audio')) {
        throw new Error(`Media attachment ${media.mediaUri} mime type ${media.mimeType || '<empty>'} not supported (audio only)`)
      }
      audioBuffer = media.buffer

      msg.attachments.push({
        name: media.mediaUri,
        mimeType: media.mimeType,
        base64: media.buffer.toString('base64')
      })
    } else if (msg.messageText) {
      if (!this.axiosTts) throw new Error('TTS not configured, only audio input supported')

      let ttsResponse = null
      try {
        ttsResponse = await this.axiosTts({
          url: this.caps.BSP_TTS_URL,
          params: {
            text: msg.messageText
          },
          responseType: 'arraybuffer'
        })
      } catch (err) {
        throw new Error(`TTS "${msg.messageText}" failed - ${this._getAxiosErrOutput(err)}`)
      }
      if (Buffer.isBuffer(ttsResponse.data)) {
        msg.attachments.push({
          name: 'tts.wav',
          mimeType: 'audio/wav',
          base64: ttsResponse.data.toString('base64')
        })
        audioBuffer = ttsResponse.data
      } else {
        throw new Error(`TTS failed, response is: ${this._getAxiosShortenedOutput(ttsResponse.data)}`)
      }
    } else {
      throw new Error('No text and no audio input given')
    }

    const botMsg = {
      sender: 'bot',
      sourceData: {},
      attachments: [{
        ...msg.attachments[0]
      }]
    }

    if (this.axiosStt) {
      let sttResponse = null
      try {
        const form = new FormData()
        form.append('content', audioBuffer, { filename: 'input.wav', contentType: 'audio/wav' })

        const body = this._getBody(Capabilities.BSP_STT_BODY)
        for (const key of Object.keys(body)) {
          form.append(key, JSON.stringify(body[key]))
        }

        sttResponse = await this.axiosStt({
          url: this.caps.BSP_STT_URL,
          headers: form.getHeaders(),
          data: form
        })
      } catch (err) {
        throw new Error(`STT failed - ${this._getAxiosErrOutput(err)}`)
      }
      if (sttResponse.data) {
        botMsg.sourceData = sttResponse.data
        botMsg.messageText = sttResponse.data.text || ''
      }
    }
    setTimeout(() => this.queueBotSays(botMsg), 0)
  }

  _getParams (capParams) {
    if (this.caps[capParams]) {
      if (_.isString(this.caps[capParams])) return JSON.parse(this.caps[capParams])
      else return this.caps[capParams]
    }
    return {}
  }

  _getBody (capBody) {
    if (this.caps[capBody]) {
      if (_.isString(this.caps[capBody])) return JSON.parse(this.caps[capBody])
      else return this.caps[capBody]
    }
    return null
  }

  _getHeaders (capHeaders) {
    if (this.caps[capHeaders]) {
      if (_.isString(this.caps[capHeaders])) return JSON.parse(this.caps[capHeaders])
      else return this.caps[capHeaders]
    }
    return {}
  }

  _getAxiosUrl (baseUrl, extUrl) {
    return baseUrl.substr(0, baseUrl.indexOf('/', 8)) + extUrl
  }

  _getAxiosShortenedOutput (data) {
    if (data) {
      return _.truncate(_.isString(data) ? data : JSON.stringify(data), { length: 200 })
    } else {
      return ''
    }
  }

  _getAxiosErrOutput (err) {
    if (err && err.response) {
      return `Status: ${err.response.status} / Response: ${this._getAxiosShortenedOutput(err.response.data)}`
    } else {
      return err.message
    }
  }
}

module.exports = BotiumConnectorBsp

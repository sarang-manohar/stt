class PcmCapture extends AudioWorkletProcessor {
  stopped = false;
  constructor() {
    super();
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        this.stopped = true;
        this.port.postMessage('stopped');
      }
    };
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (channels?.length && channels[0].length) {
      const mono = new Float32Array(channels[0].length);
      for (const channel of channels) {
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private stream: MediaStream | null = null;

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      this.mediaRecorder.start();
      this.isRecording = true;
    } catch (error) {
      throw new Error('无法访问麦克风');
    }
  }

  pauseRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.pause();
      this.isPaused = true;
    }
  }

  resumeRecording() {
    if (this.mediaRecorder && this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (this.mediaRecorder) {
        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          this.audioChunks = [];
          resolve(audioBlob);
        };
        this.mediaRecorder.stop();
        this.isRecording = false;
      }
    });
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  cleanup() {
    if (this.mediaRecorder) {
      if (this.isRecording) {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.audioChunks = [];
    this.isRecording = false;
    this.isPaused = false;
  }
}
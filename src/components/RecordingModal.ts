import { Modal, App, setIcon } from 'obsidian';

class AudioVisualizer {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  private animationId: number | null = null;
  private isPaused: boolean = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  connectStream(stream: MediaStream) {
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    this.startVisualization();
  }

  private startVisualization() {
    const draw = () => {
      if (this.isPaused) {
        this.animationId = requestAnimationFrame(draw);
        return;
      }

      this.analyser.getByteFrequencyData(this.dataArray);
      const width = this.canvas.width;
      const height = this.canvas.height;
      const ctx = this.canvas.getContext('2d');

      if (!ctx) return;

      // 清除画布
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);

      // 绘制波形
      const barWidth = width / this.dataArray.length;
      let x = 0;

      ctx.fillStyle = '#4CAF50';
      for (let i = 0; i < this.dataArray.length; i++) {
        const barHeight = (this.dataArray[i] / 255) * height;
        // 添加渐变效果
        const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
        gradient.addColorStop(0, '#4CAF50');
        gradient.addColorStop(1, '#81C784');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth;
      }

      this.animationId = requestAnimationFrame(draw);
    };

    draw();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.audioContext.close();
  }
}

export class RecordingModal extends Modal {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private timerInterval: number | null = null;
  private elapsedTime: number = 0;
  private timerDisplay: HTMLElement | null = null;
  private visualizer: AudioVisualizer | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrame: number | null = null;
  private transcriptionText: string = '';
  private isTranscribing: boolean = false;
  private transcribingContainer: HTMLElement | null = null;
  private pauseButton: HTMLElement | null = null;
  private onRecordingClose: (cancelled: boolean) => void;

  constructor(
    app: App,
    onRecordingClose: (cancelled: boolean) => void,
    private onPause: () => void,
    private onResume: () => void,
    private stream: MediaStream
  ) {
    super(app);
    this.onRecordingClose = onRecordingClose;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // 创建录音弹窗内容
    const container = contentEl.createDiv('voice2text-modal-container');
    
    // 创建波形图容器
    const waveformContainer = container.createDiv('voice2text-waveform-container');
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 100;
    canvas.className = 'voice2text-waveform';
    waveformContainer.appendChild(canvas);

    // 创建计时器显示
    const timerDisplay = container.createDiv('voice2text-timer');
    timerDisplay.setText('00:00');

    // 创建控制按钮容器
    const controlsContainer = container.createDiv('voice2text-controls');
    
    // 创建取消按钮
    const cancelButton = this.createCancelButton();
    cancelButton.addEventListener('click', () => {
      this.stopRecording(true);
      this.close();
    });

    // 创建暂停/继续按钮
    const pauseButton = this.createPauseButton();
    this.updatePauseButton(this.isPaused);

    // 创建保存按钮
    const saveButton = this.createSaveButton();
    saveButton.addEventListener('click', () => {
      this.stopRecording(false);
      this.close();
    });

    // 创建转写文本容器
    const transcriptionContainer = container.createDiv('voice2text-transcription');
    transcriptionContainer.addClass('voice2text-hidden');

    // 创建转写状态容器
    this.transcribingContainer = container.createDiv('voice2text-transcribing');
    this.transcribingContainer.addClass('voice2text-hidden');
    this.showTranscribing();

    // 初始化音频可视化器
    this.initializeVisualizer(this.stream);

    // 开始计时
    this.startTimer();
  }

  private createCancelButton(): HTMLElement {
    const cancelButton = document.createElement('button');
    cancelButton.addClass('voice2text-cancel-button');
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '18');
    line.setAttribute('y1', '6');
    line.setAttribute('x2', '6');
    line.setAttribute('y2', '18');
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '6');
    line2.setAttribute('y1', '6');
    line2.setAttribute('x2', '18');
    line2.setAttribute('y2', '18');
    
    svg.appendChild(line);
    svg.appendChild(line2);
    cancelButton.appendChild(svg);
    
    return cancelButton;
  }

  private createPauseButton(): HTMLElement {
    const pauseButton = document.createElement('button');
    pauseButton.addClass('voice2text-pause-button');
    
    return pauseButton;
  }

  private createSaveButton(): HTMLElement {
    const saveButton = document.createElement('button');
    saveButton.addClass('voice2text-save-button');
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z');
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '17 21 17 13 7 13 7 21');
    
    const polyline2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline2.setAttribute('points', '7 3 7 8 15 8');
    
    svg.appendChild(path);
    svg.appendChild(polyline);
    svg.appendChild(polyline2);
    saveButton.appendChild(svg);
    
    return saveButton;
  }

  private startTimer() {
    this.timerInterval = window.setInterval(() => {
      if (!this.isPaused) {
        this.elapsedTime++;
        const minutes = Math.floor(this.elapsedTime / 60);
        const seconds = this.elapsedTime % 60;
        this.timerDisplay = this.contentEl.querySelector('.voice2text-timer');
        if (this.timerDisplay) {
          this.timerDisplay.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }
    }, 1000);
  }

  private initializeVisualizer(stream: MediaStream): void {
    const canvas = this.contentEl.querySelector('.voice2text-waveform');
    if (canvas instanceof HTMLCanvasElement) {
      this.visualizer = new AudioVisualizer(canvas);
      this.visualizer.connectStream(stream);
    }
  }

  private pauseRecording(): void {
    this.isPaused = true;
    this.onPause();
    this.visualizer?.pause();
  }

  private resumeRecording(): void {
    this.isPaused = false;
    this.onResume();
    this.visualizer?.resume();
  }

  private stopRecording(cancelled: boolean = false): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.visualizer?.stop();
    this.onRecordingClose(cancelled);
  }

  setTranscriptionText(text: string) {
    this.transcriptionText = text;
    const transcriptionContainer = this.contentEl.querySelector('.voice2text-transcription');
    if (transcriptionContainer) {
      transcriptionContainer.removeClass('voice2text-hidden');
      this.typeText(transcriptionContainer as HTMLElement, text);
    }
  }

  showTranscribing() {
    if (this.transcribingContainer) {
      this.transcribingContainer.removeClass('voice2text-hidden');
    }
  }

  hideTranscribing() {
    if (this.transcribingContainer) {
      this.transcribingContainer.addClass('voice2text-hidden');
    }
  }

  private async typeText(element: HTMLElement, text: string) {
    element.empty();
    const textContainer = element.createDiv('voice2text-typing-text');
    
    for (let i = 0; i < text.length; i++) {
      const span = document.createElement('span');
      span.textContent = text[i];
      textContainer.appendChild(span);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  onClose() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.visualizer?.stop();
    this.onRecordingClose(true);
  }

  private updatePauseButton(isPaused: boolean): void {
    const pauseButton = this.pauseButton;
    if (!pauseButton) return;

    // 清除现有内容
    while (pauseButton.firstChild) {
      pauseButton.removeChild(pauseButton.firstChild);
    }

    if (isPaused) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      
      const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect1.setAttribute('x', '6');
      rect1.setAttribute('y', '4');
      rect1.setAttribute('width', '4');
      rect1.setAttribute('height', '16');
      
      const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect2.setAttribute('x', '14');
      rect2.setAttribute('y', '4');
      rect2.setAttribute('width', '4');
      rect2.setAttribute('height', '16');
      
      svg.appendChild(rect1);
      svg.appendChild(rect2);
      pauseButton.appendChild(svg);
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
      
      svg.appendChild(polygon);
      pauseButton.appendChild(svg);
    }
  }

  private showTranscribing(): void {
    if (!this.transcribingContainer) return;
    
    // 清除现有内容
    while (this.transcribingContainer.firstChild) {
      this.transcribingContainer.removeChild(this.transcribingContainer.firstChild);
    }

    const textSpan = document.createElement('span');
    textSpan.addClass('voice2text-transcribing-text');
    textSpan.setText('AI 转写中');

    const dotsSpan = document.createElement('span');
    dotsSpan.addClass('voice2text-transcribing-dots');
    
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.setText('.');
      dotsSpan.appendChild(dot);
    }

    this.transcribingContainer.appendChild(textSpan);
    this.transcribingContainer.appendChild(dotsSpan);
  }
} 
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
  private timer: number = 0;
  private timerInterval: number | null = null;
  private isPaused: boolean = false;
  private visualizer: AudioVisualizer;
  private transcriptionText: string = '';
  private isTranscribing: boolean = false;
  private transcribingContainer: HTMLElement | null = null;

  constructor(
    app: App,
    private onRecordingClose: (cancelled: boolean) => void,
    private onPause: () => void,
    private onResume: () => void,
    private stream: MediaStream
  ) {
    super(app);
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
    const cancelButton = controlsContainer.createEl('button', { cls: 'voice2text-button' });
    cancelButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    cancelButton.addEventListener('click', () => {
      this.stopRecording(true);
      this.close();
    });

    // 创建暂停/继续按钮
    const pauseButton = controlsContainer.createEl('button', { cls: 'voice2text-button' });
    const pauseIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    
    pauseButton.innerHTML = pauseIcon;
    pauseButton.addEventListener('click', () => {
      if (this.isPaused) {
        this.resumeRecording();
        pauseButton.innerHTML = pauseIcon;
      } else {
        this.pauseRecording();
        pauseButton.innerHTML = playIcon;
      }
    });

    // 创建保存按钮
    const saveButton = controlsContainer.createEl('button', { cls: 'voice2text-button' });
    saveButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    saveButton.addEventListener('click', () => {
      this.stopRecording(false);
      this.close();
    });

    // 创建转写文本容器
    const transcriptionContainer = container.createDiv('voice2text-transcription');
    (transcriptionContainer as HTMLElement).style.display = 'none';

    // 创建转写状态容器
    this.transcribingContainer = container.createDiv('voice2text-transcribing');
    this.transcribingContainer.style.display = 'none';
    this.transcribingContainer.innerHTML = '<span class="voice2text-transcribing-text">AI 转写中</span><span class="voice2text-transcribing-dots"><span>.</span><span>.</span><span>.</span></span>';

    // 初始化音频可视化器
    this.visualizer = new AudioVisualizer(canvas);
    this.visualizer.connectStream(this.stream);

    // 开始计时
    this.startTimer();
  }

  private startTimer() {
    this.timerInterval = window.setInterval(() => {
      if (!this.isPaused) {
        this.timer++;
        const minutes = Math.floor(this.timer / 60);
        const seconds = this.timer % 60;
        const timerDisplay = this.contentEl.querySelector('.voice2text-timer');
        if (timerDisplay) {
          timerDisplay.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }
    }, 1000);
  }

  private pauseRecording() {
    this.isPaused = true;
    this.onPause();
    this.visualizer.pause();
  }

  private resumeRecording() {
    this.isPaused = false;
    this.onResume();
    this.visualizer.resume();
  }

  private stopRecording(cancelled: boolean) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.visualizer.stop();
    this.onRecordingClose(cancelled);
  }

  setTranscriptionText(text: string) {
    this.transcriptionText = text;
    const transcriptionContainer = this.contentEl.querySelector('.voice2text-transcription');
    if (transcriptionContainer) {
      (transcriptionContainer as HTMLElement).style.display = 'block';
      this.typeText(transcriptionContainer as HTMLElement, text);
    }
  }

  showTranscribing() {
    if (this.transcribingContainer) {
      this.transcribingContainer.style.display = 'flex';
    }
  }

  hideTranscribing() {
    if (this.transcribingContainer) {
      this.transcribingContainer.style.display = 'none';
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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.visualizer.stop();
    this.onRecordingClose(true);
  }
} 
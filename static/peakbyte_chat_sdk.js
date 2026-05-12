class ChatSDK {
    constructor(config) {
        this.config = {
            subdomain: "peakbyte",
            baseUrl: "http://peakbyte.peak-hc.store",
            wsUrl: null,
            autoOpen: false, // Default false
            position: 'right', // Default right
            ...config
        };

        this.validateConfig();

        this.isVisible = false;
        this.messages = [];
        this.socket = null;
        this.threadId = localStorage.getItem('chat_sdk_thread_id');
        this.currentStatus = 'AI_ACTIVE';
        this.typingTimeout = null;
        this.messageQueue = this.messageQueue || [];
        this.widgetConfig = null; // Store config
        this.isSoundEnabled = localStorage.getItem('chat_sdk_sound_enabled') !== 'false'; // Default to true
        this.isSending = false;

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.init();
        } else {
            window.addEventListener('DOMContentLoaded', () => this.init());
        }
    }

    validateConfig() {
        if (!this.config.subdomain && !this.config.baseUrl) {
            console.error('ChatSDK: Subdomain or Base URL is required.');
            return;
        }

        // Construct Base URL if not provided
        if (!this.config.baseUrl) {
            const pageProtocol = window.location.protocol; // Detect current page protocol
            const defaultBaseProtocol = pageProtocol === 'https:' ? 'https://' : 'http://';

            this.config.baseUrl = `${defaultBaseProtocol}${this.config.subdomain}.peak-hc.store`;

            // Logic to auto-detect current domain for dev testing if subdomain is 'localhost'
            if (this.config.subdomain.startsWith('peak-hc.store') || window.location.hostname.includes('peak-hc.store')) {
                if (this.config.subdomain.includes(':')) {
                    this.config.baseUrl = `http://${this.config.subdomain}`;
                } else {
                    // Use page protocol for peak-hc.store to avoid "insecure operation" on HTTPS
                    this.config.baseUrl = `${defaultBaseProtocol}peak-hc.store`;
                }
            }
        }
    }

    static init(config) {
        return new ChatSDK(config);
    }

    init() {
        this.createShadowDOM();
        this.injectStyles();
        this.render();
        this.attachEvents();

        // Recover session if exists
        // Fetch config and then recover session
        this.fetchWidgetConfig().then(() => {
            if (this.threadId) {
                this.reconnectSession();
            }
        });
    }

    async fetchWidgetConfig() {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/chat/config/`);
            if (response.ok) {
                this.widgetConfig = await response.json();
                this.applyConfig();
            }
        } catch (e) {
            console.warn('ChatSDK: Using default config', e);
        }
    }

    applyConfig() {
        if (!this.widgetConfig) return;
        const c = this.widgetConfig;

        // 1. Apply Styles (CSS Variables on Host)
        this.container.style.setProperty('--primary-color', c.primary_color);
        // Simple darken for hover - rudimentary approach or just use same color
        this.container.style.setProperty('--primary-color-hover', c.primary_color);
        this.container.style.setProperty('--launcher-bottom', `${c.visibility.bottom}px`);
        this.container.style.setProperty('--launcher-side', `${c.visibility.side}px`);

        // Theme
        if (c.theme === 'dark') {
            this.container.style.setProperty('--chat-bg', '#1f2937');
            this.container.style.setProperty('--chat-text', '#f9fafb');
            this.container.style.setProperty('--msg-ai-bg', '#374151');
            this.container.style.setProperty('--msg-ai-text', '#f9fafb');
            this.container.style.setProperty('--input-bg', '#374151');
            this.container.style.setProperty('--input-text', '#f9fafb');
            this.container.style.setProperty('--header-bg', '#111827');
            this.container.style.setProperty('--powered-by-bg', '#1f2937');
            this.container.style.setProperty('--powered-by-text', '#9ca3af');
        } else {
            this.container.style.setProperty('--chat-bg', '#f9fafb');
            this.container.style.setProperty('--chat-text', '#1f2937');
            this.container.style.setProperty('--msg-ai-bg', '#ffffff');
            this.container.style.setProperty('--msg-ai-text', '#1f2937');
            this.container.style.setProperty('--input-bg', '#ffffff');
            this.container.style.setProperty('--input-text', '#000000');
            this.container.style.setProperty('--powered-by-bg', '#f9fafb');
            this.container.style.setProperty('--powered-by-text', '#9ca3af');
        }

        // 2. Texts (Localization/Direction)
        // Check if the current page is being viewed in RTL mode (e.g., via Django's language switcher)
        const isRTLPage = document.documentElement.dir === 'rtl' || (document.documentElement.lang && document.documentElement.lang.startsWith('ar'));
        const widgetIsArabic = (c.language && c.language.default === 'ar');

        // Handle RTL layout (based on current page direction OR widget content)
        if (isRTLPage || widgetIsArabic) {
            this.window.classList.add('rtl');
        } else {
            this.window.classList.remove('rtl');
        }

        if (c.text) {
            const lang = c.language.default || 'en';
            const texts = c.text[lang] || c.text['en'];

            if (texts) {
                // Update DOM elements
                const input = this.shadow.querySelector('.chat-input');
                if (input && texts.placeholder) input.placeholder = texts.placeholder;

                // Store for later use
                this.texts = texts;

                // Show Welcome Message if empty
                if (this.messages.length === 0 && !this.threadId) {
                    // Check if we already appended it (to avoid dupes on re-config)
                    const existingWelcome = this.shadow.querySelector('.message-ai');
                    if (!existingWelcome) {
                        this.appendMessage({
                            content: texts.welcome,
                            type: 'ai', // or system, but AI looks better as a bubble
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }
        }

        // Mobile Visibility
        if (!c.visibility.mobile && window.innerWidth < 768) {
            this.container.style.display = 'none';
        }

        // Apply alignment class to launcher and window
        // Position depends on the actual layout direction: RTL -> Left, LTR -> Right
        let position = isRTLPage ? 'left' : (this.config.position || 'right');

        if (position === 'left') {
            this.launcher.classList.add('align-left');
            this.window.classList.add('align-left');
        } else {
            this.launcher.classList.remove('align-left');
            this.window.classList.remove('align-left');
        }

        // Auto Open Logic
        if (this.config.autoOpen && !this.isVisible) {
            // Small delay to ensure render
            setTimeout(() => {
                this.toggleWindow();
            }, 500);
        }
    }

    createShadowDOM() {
        this.container = document.createElement('div');
        this.container.id = 'chat-sdk-container';
        document.body.appendChild(this.container);
        this.shadow = this.container.attachShadow({ mode: 'open' });
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                
                /* Defaults */
                --primary-color: #2563eb;
                --primary-color-hover: #1d4ed8;
                --launcher-bottom: 20px;
                --launcher-side: 20px;
                --chat-bg: #f9fafb;
                --chat-text: #1f2937;
                --msg-ai-bg: #ffffff;
                --msg-ai-text: #1f2937;
                --input-bg: #ffffff;
                --input-text: #000000;
                --alignment: right; /* right or left */
                --powered-by-bg: #f9fafb;
                --powered-by-text: #9ca3af;
            }
            :host {
                text-align: left;
            }
            .chat-window.rtl {
                text-align: right;
                direction: rtl;
                font-family: 'Tahoma', 'Segoe UI', 'Arial', sans-serif; /* Better Arabic fonts */
            }
            .chat-window.rtl .chat-header h3 {
                text-align: right;
            }
            .chat-window.rtl .header-actions {
                 /* In RTL, flex-direction is still row but items start from right. 
                    However, our header has space-between. 
                    We want actions on the left (end) and title on right (start).
                    Default flex behavior in RTL handles this. */
            }
            .chat-window.rtl .close-btn {
                /* Might want to flip icon or keep as X */
            }
            .chat-window.rtl .message-info {
                flex-direction: row;
             }
             .chat-window.rtl .chat-input {
                text-align: right;
             }
             .chat-window.rtl .send-btn svg {
                transform: rotate(180deg); /* Flip send icon for RTL */
                margin-left: 0;
                margin-right: 2px;
             }
            .chat-launcher {
                position: fixed;
                bottom: var(--launcher-bottom);
                right: var(--launcher-side); /* Default to Right */
                left: auto;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: var(--primary-color);
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 99999;
                transition: transform 0.2s ease;
                color: white;
            }
            .chat-launcher.align-left {
                right: auto;
                left: var(--launcher-side);
            }
            .chat-launcher:hover {
                transform: scale(1.05);
            }
            .chat-launcher svg {
                width: 30px;
                height: 30px;
                fill: white;
            }
            .chat-window {
                position: fixed;
                bottom: calc(var(--launcher-bottom) + 80px); /* Increased spacing */
                right: var(--launcher-side); /* Default to Right */
                left: auto;
                width: 380px;
                height: 600px;
                max-height: 80vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
                display: flex;
                flex-direction: column;
                z-index: 99999;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                transform-origin: bottom right;
                pointer-events: none;
                transition: opacity 0.3s ease, transform 0.3s ease;
                overflow: hidden;
            }
            .chat-window.align-left {
                right: auto;
                left: var(--launcher-side);
                transform-origin: bottom left;
            }
            .chat-window.open {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: all;
            }
            .chat-header {
                padding: 16px;
                background: var(--primary-color);
                color: white;
                display: flex;
                flex-direction: column; /* Increased height for subtitle */
                gap: 4px;
                flex-shrink: 0;
                position: relative;
            }
            .chat-header-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
            }
            .chat-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }
            .chat-header-subtitle {
                font-size: 13px;
                opacity: 0.9;
            }
            .header-actions {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .close-btn, .sound-btn {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
            }
            .close-btn svg, .sound-btn svg {
                width: 20px;
                height: 20px;
                fill: white;
            }
            .chat-body {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                background: var(--chat-bg);
                color: var(--chat-text);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            /* Message Styles */
            .message-wrapper {
                display: flex;
                flex-direction: column;
                max-width: 85%;
                margin-bottom: 4px;
            }
            .message-user {
                align-self: flex-end;
                align-items: flex-end;
            }
            .message-ai, .message-agent {
                align-self: flex-start;
                align-items: flex-start;
            }
            .message-system {
                align-self: center;
                max-width: 95%;
                text-align: center;
                margin: 8px 0;
            }
            .message-bubble {
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.5;
                word-wrap: break-word;
                position: relative;
            }
            .message-user .message-bubble {
                background: var(--primary-color);
                color: white;
                border-bottom-right-radius: 2px;
            }
            .message-ai .message-bubble, .message-agent .message-bubble {
                background: var(--msg-ai-bg);
                color: var(--msg-ai-text);
                border: 1px solid #e5e7eb;
                border-bottom-left-radius: 2px;
            }
            .message-system .message-bubble {
                background: #f3f4f6;
                color: #6b7280;
                font-size: 12px;
                padding: 6px 12px;
                border-radius: 20px;
                border: 1px solid #e5e7eb;
            }
            .message-info {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 4px;
                font-size: 11px;
                color: #9ca3af;
                padding: 0 4px;
            }
            .timestamp {
                font-size: 10px;
            }
            
            /* Badges */
            .ai-badge {
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                color: white;
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 600;
                text-transform: uppercase;
            }
            .agent-badge {
                background: #dcfce7;
                color: #166534;
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 600;
                text-transform: uppercase;
                border: 1px solid #bbf7d0;
            }

            /* Typing Indicator */
            .typing-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 14px;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                border-bottom-left-radius: 2px;
                width: fit-content;
                margin-bottom: 8px;
                display: none; /* Hidden by default */
            }
            .typing-badge-container {
                display: flex;
                align-items: center;
            }
            .typing-text {
                font-size: 12px;
                color: #6b7280;
            }

            /* Footer & Input */
            .chat-footer {
                padding: 12px;
                background: var(--input-bg);
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .footer-actions {
                display: flex;
                gap: 8px;
            }
            .attach-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 6px;
                color: #9ca3af;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s;
            }
            .attach-btn:hover {
                color: var(--primary-color);
            }
            .attach-btn svg {
                width: 20px;
                height: 20px;
                fill: currentColor;
            }
            .chat-input {
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #e5e7eb;
                border-radius: 20px; /* Rounded input */
                outline: none;
                font-size: 14px;
                font-family: inherit;
                resize: none;
                max-height: 120px;
                min-height: 40px;
                box-sizing: border-box;
                overflow-y: auto;
                background: #f9fafb;
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE 10+ */
            }
            .chat-input::-webkit-scrollbar { 
                display: none; /* Chrome/Safari */
            }
            .chat-input:focus {
                border-color: var(--primary-color);
                background: white;
            }
            .send-btn {
                background: var(--primary-color);
                color: white;
                border: none;
                width: 36px;
                height: 36px;
                border-radius: 12px; /* Smoother radius */
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: background 0.2s, transform 0.1s;
            }
            .send-btn:hover {
                background: var(--primary-color-hover);
                transform: scale(1.05);
            }
            .send-btn svg {
                width: 18px;
                height: 18px;
                fill: white;
                margin-left: 2px;
            }
            .powered-by {
                text-align: center;
                padding: 4px;
                font-size: 10px;
                color: var(--powered-by-text);
                background: var(--powered-by-bg);
            }
            .powered-by a {
                color: #9ca3af;
                text-decoration: none;
                font-weight: 500;
            }
            .powered-by a:hover {
                text-decoration: underline;
            }
             .empty-state {
                display: none; /* Hide old empty state text */
            }

            /* Premium File Attachment Styling */
            .attachment-card {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 14px;
                background: rgba(255, 255, 255, 0.9);
                border: 1px solid rgba(0, 0, 0, 0.05);
                border-radius: 12px;
                margin-top: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                text-decoration: none !important;
                position: relative;
                overflow: hidden;
                backdrop-filter: blur(8px);
                color: #1F2937;
            }

            .attachment-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
                border-color: rgba(0, 0, 0, 0.1);
            }

            .message-user .attachment-card {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .attachment-icon-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border-radius: 10px;
                background: rgba(37, 99, 235, 0.1);
                color: var(--primary-color);
                font-size: 1.1rem;
                flex-shrink: 0;
            }

            .message-user .attachment-icon-wrapper {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }

            .attachment-details {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            .attachment-name {
                font-size: 0.85rem;
                font-weight: 600;
                color: inherit;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: 1.3;
            }

            .message-user .attachment-name {
                color: white;
            }

            .attachment-action {
                font-size: 0.7rem;
                color: #6B7280;
                font-weight: 500;
                margin-top: 2px;
            }

            .message-user .attachment-action {
                color: rgba(255, 255, 255, 0.8);
            }

            /* Premium Image Preview Styling */
            .attachment-image-wrapper {
                margin-top: 8px;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                position: relative;
                display: block;
                max-width: 100%;
            }

            .attachment-image-wrapper img {
                display: block;
                max-width: 100%;
                max-height: 200px;
                object-fit: cover;
                transition: transform 0.3s ease;
                border-radius: 12px;
            }

            .attachment-image-wrapper:hover img {
                transform: scale(1.02);
            }

            .attachment-image-overlay {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.0);
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: all 0.2s ease;
                pointer-events: none;
                border-radius: 12px;
            }

            .attachment-image-wrapper:hover .attachment-image-overlay {
                background: rgba(0, 0, 0, 0.2);
                opacity: 1;
            }

            .attachment-image-overlay-btn {
                background: rgba(255, 255, 255, 0.9);
                color: #1F2937;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                transform: translateY(10px);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            .attachment-image-wrapper:hover .attachment-image-overlay-btn {
                transform: translateY(0);
            }
        `;
        this.shadow.appendChild(style);
    }

    render() {
        // Launcher
        const launcher = document.createElement('div');
        launcher.className = 'chat-launcher';
        launcher.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
        `;
        this.launcher = launcher;

        // Window
        const windowEl = document.createElement('div');
        windowEl.className = 'chat-window';
        windowEl.innerHTML = `
            <div class="chat-header">
                <div class="chat-header-top">
                    <h3>Need help?</h3>
                    <div class="header-actions">
                         <button class="sound-btn">
                            <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07l1.41 1.41a7 7 0 0 0 0-9.9l-1.41 1.42z"/></svg>
                        </button>
                        <button class="close-btn">
                            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="chat-header-subtitle">How can I help you?</div>
            </div>
            <div class="chat-body" id="chat-body">
                <!-- No empty state text centered anymore, just content -->
                <div class="typing-indicator" id="typing-indicator">
                    <div class="typing-badge-container" id="typing-badge-container">
                         <span class="ai-badge" id="typing-badge">AI</span>
                    </div>
                    <span class="typing-text" id="typing-text">Thinking...</span>
                </div>
            </div>
            <div class="chat-footer">
                <input type="file" id="chat-file-input" style="display: none;">
                <button class="attach-btn" title="Attach file">
                    <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5a4 4 0 0 0-8 0v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                </button>
                <textarea class="chat-input" placeholder="Write a message..." rows="1"></textarea>
                <button class="send-btn">
                    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
            <div class="powered-by">
                Powered by <a href="https://peak-hc.store" target="_blank">Peak Desk</a>
            </div>
        `;
        this.window = windowEl;
        this.chatBody = windowEl.querySelector('#chat-body');
        // this.emptyState removed
        this.input = windowEl.querySelector('.chat-input');
        this.fileInput = windowEl.querySelector('#chat-file-input');

        // Typing Indicator Elements
        this.typingIndicator = windowEl.querySelector('#typing-indicator');
        this.typingBadge = windowEl.querySelector('#typing-badge');
        this.typingText = windowEl.querySelector('#typing-text');

        this.shadow.appendChild(launcher);
        this.shadow.appendChild(windowEl);
    }

    attachEvents() {
        this.launcher.addEventListener('click', () => this.toggleWindow());
        this.shadow.querySelector('.close-btn').addEventListener('click', () => this.toggleWindow());
        this.shadow.querySelector('.sound-btn').addEventListener('click', () => this.toggleSound());

        this.updateSoundIcon(); // Set initial icon

        this.shadow.querySelector('.send-btn').addEventListener('click', () => this.sendMessage());

        const attachBtn = this.shadow.querySelector('.attach-btn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                this.fileInput.click();
            });
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.sendMessage(file);
                    this.fileInput.value = ''; // Reset
                }
            });
        }

        // Auto-resize textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    toggleWindow() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.window.classList.add('open');
            this.input.focus();
            this.scrollToBottom(true);
        } else {
            this.window.classList.remove('open');
        }
    }

    scrollToBottom(force = false) {
        if (!this.chatBody) return;
        const isNearBottom = this.chatBody.scrollHeight - this.chatBody.scrollTop - this.chatBody.clientHeight < 150;
        if (isNearBottom || force) {
            // Use requestAnimationFrame to ensure rendering is complete
            requestAnimationFrame(() => {
                this.chatBody.scrollTop = this.chatBody.scrollHeight;
            });
        }
    }

    // --- Message Rendering ---

    appendMessage(msg, isOptimistic = false) {
        // Prevent duplicates by ID or Optimistic ID
        if (msg.id && this.shadow.querySelector(`[data-message-id="${msg.id}"]`)) return;

        const optId = msg.optimistic_id || (msg.additional_kwargs && msg.additional_kwargs.optimistic_id);
        if (isOptimistic && optId && this.shadow.querySelector(`[data-optimistic-id="${optId}"]`)) return;

        if (this.emptyState) this.emptyState.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper';
        if (isOptimistic) {
            wrapper.classList.add('is-optimistic');
            if (optId) wrapper.setAttribute('data-optimistic-id', optId);
        }
        if (msg.id) wrapper.setAttribute('data-message-id', msg.id);

        // Determine Type & Styling
        let displayType = 'message-ai';
        let senderName = msg.sender_name || 'AI Assistant';
        let badgeHtml = '<span class="ai-badge">AI</span>';

        if (msg.type === 'human' || msg.type === 'user') {
            displayType = 'message-user';
            senderName = 'You';
            badgeHtml = '';
        } else if (msg.type === 'system' || (msg.additional_kwargs && msg.additional_kwargs.system_notification)) {
            displayType = 'message-system';
            senderName = 'System';
            badgeHtml = '';
        } else if (msg.badge_type === 'agent') {
            displayType = 'message-agent';
            senderName = msg.sender_name || 'Agent';
            badgeHtml = '<span class="agent-badge">Agent</span>';
        }

        wrapper.classList.add(displayType);

        // Content Processing (Simple escape for now, can add marked if included in page)
        let contentHtml = this.escapeHtml(msg.content || '');
        if (typeof window.marked !== 'undefined' && msg.content) {
            contentHtml = window.marked.parse(msg.content);
        }

        let attachmentHtml = '';
        if (msg.attachment_url || (msg.additional_kwargs && msg.additional_kwargs.attachment_url)) {
            const url = msg.attachment_url || msg.additional_kwargs.attachment_url;
            const name = msg.attachment_name || (msg.additional_kwargs && msg.additional_kwargs.attachment_name) || 'Download Attachment';
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);

            if (isImage) {
                attachmentHtml = `
                    <div class="mt-2">
                        <a href="${url}" target="_blank" class="attachment-image-wrapper">
                            <img src="${url}" alt="${name}">
                            <div class="attachment-image-overlay">
                                <div class="attachment-image-overlay-btn">
                                    <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                                </div>
                            </div>
                        </a>
                    </div>`;
            } else {
                attachmentHtml = `
                    <a href="${url}" target="_blank" class="attachment-card">
                        <div class="attachment-icon-wrapper">
                            <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div class="attachment-details">
                            <span class="attachment-name">${name}</span>
                            <span class="attachment-action">Click to download</span>
                        </div>
                    </a>`;
            }
        }

        // Timestamp
        const time = msg.created_at
            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // System Message Template
        if (msg.type === 'system' || (msg.additional_kwargs && msg.additional_kwargs.system_notification)) {
            wrapper.innerHTML = `
                <div class="message-bubble">${contentHtml}</div>
            `;
        } else {
            // Standard Message Template
            wrapper.innerHTML = `
                <div class="message-bubble">
                    ${contentHtml}
                    ${attachmentHtml}
                </div>
                <div class="message-info">
                    ${badgeHtml}
                    <span class="timestamp">${time}</span>
                    <span class="sender-name">${senderName}</span>
                </div>
            `;
        }

        // Insert before typing indicator or replace optimistic
        const existingOptEl = optId ? this.shadow.querySelector(`[data-optimistic-id="${optId}"]`) : null;
        if (existingOptEl && !isOptimistic) {
            existingOptEl.replaceWith(wrapper);
        } else {
            this.typingIndicator.insertAdjacentElement('beforebegin', wrapper);
        }
        this.scrollToBottom(true);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\\n/g, '<br>');
    }

    showTypingIndicator(mode, senderName) {
        if (mode === 'agent') {
            this.typingBadge.className = 'agent-badge';
            this.typingBadge.textContent = 'Agent';
            this.typingText.textContent = `${senderName || 'Agent'} is typing...`;

            // Auto hide agent typing safely
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => this.hideTypingIndicator(), 4000);
        } else {
            this.typingBadge.className = 'ai-badge';
            this.typingBadge.textContent = 'AI';
            this.typingText.textContent = 'Thinking...';
        }

        this.typingIndicator.style.display = 'flex';
        this.scrollToBottom(true);
    }

    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
        clearTimeout(this.typingTimeout);
    }

    // --- Interaction ---

    async sendMessage(file = null) {
        if (this.isSending) return;

        const text = this.input.value.trim();
        if (!text && !file) return;

        this.isSending = true;
        this.input.disabled = true;
        if (this.sendBtn) this.sendBtn.disabled = true;

        const optimisticId = 'opt_' + Date.now();

        // Optimistic UI for text
        if (text && !file) {
            const optimisticMsg = {
                optimistic_id: optimisticId,
                content: text,
                type: 'user',
                created_at: new Date().toISOString()
            };
            this.appendMessage(optimisticMsg, true);
        }

        const currentText = text; // Capture text before clearing
        this.input.value = '';
        this.input.style.height = 'auto'; // Reset height

        // Typing state (AI is default unless taken over)
        if (this.currentStatus !== 'HUMAN_TAKOVER') {
            this.showTypingIndicator('ai');
        }

        try {
            if (!this.threadId) {
                await this.createSession(currentText, file, optimisticId);
            } else {
                this.sendTextAndFile(currentText, file, optimisticId);
            }
        } finally {
            this.isSending = false;
            this.input.disabled = false;
            if (this.sendBtn) this.sendBtn.disabled = false;
            this.input.focus();
        }
    }
    sendTextAndFile(text, file, optimisticId = null) {
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result;
                this.sendViaWebSocket(JSON.stringify({
                    type: 'message',
                    content: text || 'Attached a file',
                    attachment: {
                        name: file.name,
                        data: base64Data
                    },
                    optimistic_id: optimisticId
                }), true);
            };
            reader.readAsDataURL(file);
        } else if (text) {
            this.sendViaWebSocket(text, false, optimisticId);
        }
    }

    async createSession(initialMessage, initialFile = null, optimisticId = null) {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/chat/session/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: initialMessage || 'Attached a file',
                    optimistic_id: optimisticId
                })
            });

            if (!response.ok) throw new Error('Failed to create session');

            const data = await response.json();
            this.threadId = data.thread_id;
            this.config.wsUrl = data.ws_url;

            localStorage.setItem('chat_sdk_thread_id', this.threadId);
            this.connectWebSocket(initialMessage, initialFile, optimisticId);

        } catch (error) {
            console.error('ChatSDK Error:', error);
            // Replace optimistic with error or alert
            this.hideTypingIndicator();
            this.appendMessage({ content: 'Failed to start chat. Please try again.', type: 'system' });
        }
    }

    reconnectSession() {
        if (!this.config.wsUrl) {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const host = this.config.baseUrl.replace(/^https?:\/\//, '');
            this.config.wsUrl = `${protocol}://${host}/ws/chat/${this.threadId}/`;
        }
        this.connectWebSocket();
    }

    connectWebSocket(initialMessage = null, initialFile = null, optimisticId = null) {
        if (!this.config.wsUrl || !this.threadId) {
            return; // Don't attempt connection if there is no active session
        }
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                if (initialMessage || initialFile) this.sendTextAndFile(initialMessage, initialFile, optimisticId);
                return;
            }
            this.socket.close();
        }

        this.messageQueue = this.messageQueue || [];
        if (initialMessage || initialFile) {
            this.messageQueue.push({ text: initialMessage, file: initialFile, optimisticId: optimisticId });
        }

        this.socket = new WebSocket(this.config.wsUrl);

        this.socket.onopen = () => {
            console.log('ChatSDK: Connected');

            // Send Tech Info
            try {
                this.sendViaWebSocket(JSON.stringify({
                    type: 'tech_info',
                    content: this.getTechInfo()
                }), true); // raw send
            } catch (e) {
                console.error("ChatSDK: Failed to send tech info", e);
            }

            // Process queue
            if (this.messageQueue) {
                while (this.messageQueue.length > 0) {
                    const msg = this.messageQueue.shift();
                    if (typeof msg === 'string') {
                        this.sendViaWebSocket(msg);
                    } else if (msg.isRaw !== undefined) {
                        this.sendViaWebSocket(msg.text, msg.isRaw);
                    } else if (msg.text || msg.file) {
                        this.sendTextAndFile(msg.text, msg.file, msg.optimisticId);
                    } else if (msg.content) {
                        // Some other fallback
                        this.sendViaWebSocket(msg.content);
                    }
                }
            }
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.socket.onclose = (e) => {
            console.log('ChatSDK: Disconnected', e.reason);
            // Simple reconnect backoff could go here
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.socket.onerror = (err) => console.error('ChatSDK WS Error:', err);
    }

    sendViaWebSocket(text, isRaw = false, optimisticId = null) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(isRaw ? text : JSON.stringify({
                content: text,
                optimistic_id: optimisticId
            }));
        } else {
            // Queue if not open
            this.messageQueue = this.messageQueue || [];
            this.messageQueue.push({ text: text, isRaw: isRaw, optimisticId: optimisticId }); // queue object with raw flag
        }
    }

    handleWebSocketMessage(data) {
        if (data.type === 'error') {
            console.error('Server Error:', data.content);
            if (data.code === 'invalid_session') {
                console.warn('ChatSDK: Session invalid or mismatched. Clearing local state.');
                localStorage.removeItem('chat_sdk_thread_id');
                this.threadId = null;
                // No need to close socket manually, the backend will close it after sending this
            }
            if (data.content && data.content.includes("closed")) {
                this.currentStatus = 'CLOSED';
                this.updateUIForStatus();
            }
            return;
        }

        // History
        if (data.type === 'history') {
            if (data.thread_status) {
                this.currentStatus = data.thread_status;
            }
            if (data.messages && data.messages.length > 0) {
                this.chatBody.innerHTML = '';
                // this.chatBody.appendChild(this.emptyState); // Removed
                this.chatBody.appendChild(this.typingIndicator);
                this.hideTypingIndicator(); // Ensure hidden initially

                data.messages.forEach(msg => this.appendMessage(msg));
            }
            this.updateUIForStatus();
            return;
        }

        // Typing Indicators
        if (data.type === 'typing') {
            this.showTypingIndicator('agent', data.sender_name);
            return;
        }
        if (data.type === 'stop_typing') {
            this.hideTypingIndicator();
            return;
        }

        // Thread Status Actions
        if (data.type === 'thread_action') {
            if (data.new_status) {
                this.currentStatus = data.new_status;
                this.updateUIForStatus();
            }
            return;
        }
        if (data.status && data.status !== this.currentStatus) {
            this.currentStatus = data.status;
            this.updateUIForStatus();
        }

        // Standard Messages
        if (data.id && !this.shadow.querySelector(`[data-message-id="${data.id}"]`)) {
            // Remove optimistic messages that match the content exactly, or just the oldest one
            // This prevents nuking multiple queued file uploads or fast text inputs
            const optimistic = Array.from(this.shadow.querySelectorAll('.is-optimistic'));
            if (optimistic.length > 0) {
                // If this is a user message returning, remove matching optimistic
                if (data.type === 'human' || data.type === 'user') {
                    const optId = data.optimistic_id || (data.additional_kwargs && data.additional_kwargs.optimistic_id);
                    const match = optId ? this.shadow.querySelector(`[data-optimistic-id="${optId}"]`) : null;

                    if (match) {
                        // Do nothing, appendMessage will handle the replacement in-place
                    } else {
                        // fallback check by content
                        const contentMatch = optimistic.find(el => el.textContent.includes(data.content || 'Attached a file'));
                        if (contentMatch) contentMatch.remove();
                        else optimistic[0].remove();
                    }
                }
            }

            if (data.type === 'ai' || data.badge_type === 'agent') {
                this.hideTypingIndicator();
                this.playNotificationSound(); // Play sound for incoming messages
            }
            this.appendMessage(data);
        }
    }

    // --- Sound & Notifications ---

    toggleSound() {
        this.isSoundEnabled = !this.isSoundEnabled;
        localStorage.setItem('chat_sdk_sound_enabled', this.isSoundEnabled);
        this.updateSoundIcon();
    }

    updateSoundIcon() {
        const btn = this.shadow.querySelector('.sound-btn');
        if (!btn) return;

        if (this.isSoundEnabled) {
            // Volume On Icon
            btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-4 0-.29.29L5.41 8H2v8h3.41l4.29 4.29.29.29V3.23zm5.39 6.55A4.98 4.98 0 0 1 15.65 12c0 1.09-.34 2.1-.92 2.95l1.44 1.44C16.74 15.39 17.65 13.8 17.65 12c0-2.48-1.37-4.63-3.41-5.71l-1.45 1.44z"/></svg>`;
            btn.setAttribute('title', 'Mute Sound');
        } else {
            // Volume Off Icon
            btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
            btn.setAttribute('title', 'Unmute Sound');
        }
    }

    playNotificationSound() {
        if (!this.isSoundEnabled || document.hidden) return; // Optional: Play even if hidden? User asked for "sound to work". Usually yes.
        // Let's remove document.hidden check to ensure they hear it even if tabbed away.
        if (!this.isSoundEnabled) return;

        try {
            // Simple "Pop" sound
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(500, audioCtx.currentTime); // 500Hz
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            console.warn('Audio playback failed', e);
        }
    }
    updateUIForStatus() {
        if (this.currentStatus === 'CLOSED') {
            this.input.disabled = true;
            this.input.placeholder = "Chat closed";
            if (this.sendBtn) this.sendBtn.disabled = true;

            // Show new chat button if not already shown
            if (!this.shadow.querySelector('.new-chat-btn-container')) {
                const btnContainer = document.createElement('div');
                btnContainer.className = 'new-chat-btn-container message-system';
                btnContainer.innerHTML = `
                    <div class="message-bubble" style="background: none; border: none; padding: 0;">
                        <button class="new-chat-btn" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: 500;">
                            Start New Chat
                        </button>
                    </div>
                `;
                btnContainer.querySelector('.new-chat-btn').addEventListener('click', () => {
                    this.startNewChat();
                });

                this.typingIndicator.insertAdjacentElement('beforebegin', btnContainer);
                this.scrollToBottom(true);
            }
        }
    }

    startNewChat() {
        localStorage.removeItem('chat_sdk_thread_id');
        this.threadId = null;
        this.config.wsUrl = null;
        this.currentStatus = 'AI_ACTIVE';
        this.messages = [];

        if (this.socket) {
            this.socket.onclose = null; // Prevent auto-reconnection to closed thread
            this.socket.close();
            this.socket = null;
        }

        this.chatBody.innerHTML = '';
        this.chatBody.appendChild(this.typingIndicator);
        this.hideTypingIndicator();

        this.input.disabled = false;
        if (this.texts && this.texts.placeholder) {
            this.input.placeholder = this.texts.placeholder;
        } else {
            this.input.placeholder = "Write a message...";
        }

        if (this.sendBtn) this.sendBtn.disabled = false;

        if (this.texts && this.texts.welcome) {
            this.appendMessage({
                content: this.texts.welcome,
                type: 'ai',
                created_at: new Date().toISOString()
            });
        }

        this.input.focus();
    }

    getTechInfo() {
        const ua = navigator.userAgent;
        let browser = "Unknown";
        if (ua.indexOf("Firefox") > -1) browser = "Mozilla Firefox";
        else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Internet";
        else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
        else if (ua.indexOf("Trident") > -1) browser = "Microsoft Internet Explorer";
        else if (ua.indexOf("Edge") > -1) browser = "Microsoft Edge";
        else if (ua.indexOf("Chrome") > -1) browser = "Google Chrome"; // Check Chrome before Safari
        else if (ua.indexOf("Safari") > -1) browser = "Apple Safari";

        let os = "Unknown OS";
        if (ua.indexOf("Win") > -1) os = "Windows";
        else if (ua.indexOf("Mac") > -1) os = "MacOS";
        else if (ua.indexOf("Linux") > -1) os = "Linux";
        else if (ua.indexOf("Android") > -1) os = "Android";
        else if (ua.indexOf("like Mac") > -1) os = "iOS";

        return {
            browser: browser,
            device_type: /Mobi|Android/i.test(ua) ? "Mobile" : "Desktop",
            screen_resolution: `${window.screen.width}x${window.screen.height}`,
            os_info: os,
            language: navigator.language || navigator.userLanguage,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            userAgent: ua
        };
    }
}

// Expose to window
window.ChatSDK = ChatSDK;

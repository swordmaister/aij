import { SceneManager } from './managers/SceneManager.js';
import { ObjectManager } from './managers/ObjectManager.js';
import { InputManager } from './managers/InputManager.js';
import { XRManager } from './managers/XRManager.js';
import { NetworkManager } from './managers/NetworkManager.js';
import { HistoryManager } from './managers/HistoryManager.js';
import { LauncherManager } from './managers/LauncherManager.js';
import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

class App {
    constructor() {
        this.launcherManager = new LauncherManager((mode) => this.init(mode));
    }

    init(mode) {
        this.mode = mode;
        this.sceneManager = new SceneManager('canvas-container', mode);
        this.objectManager = new ObjectManager(this.sceneManager);
        this.inputManager = new InputManager(this.sceneManager, this.objectManager, mode);

        if (mode === 'vr') {
            this.xrManager = new XRManager(this.sceneManager, this.objectManager);
        } else {
            this.xrManager = { update: () => {} }; // Mock
        }

        this.networkManager = new NetworkManager(this.objectManager);
        this.objectManager.setNetworkManager(this.networkManager);

        this.historyManager = new HistoryManager(this.objectManager);
        this.objectManager.setHistoryManager(this.historyManager);

        this.objectManager.onLibraryUpdate = this.renderLibraryUI.bind(this);

        this.setupUI();
        this.spawnInitialObjects();
        this.startLoop();

        // Auto-enable Gyro if mobile mode
        if (mode === 'mobile') {
            const btnGyro = document.getElementById('btn-gyro');
            if(btnGyro) {
                 this.inputManager.isGyroEnabled = true;
                 btnGyro.classList.add('mode-active');
            }
        }
    }

    setupUI() {
        // Generate Button
        document.getElementById('btn-generate').addEventListener('click', () => {
            const input = document.getElementById('word-input');
            const rawText = input.value;
            if (!rawText.trim()) {
                this.objectManager.spawnNameTag('無題');
                return;
            }
            const words = rawText.split(',').map(w => w.trim()).filter(w => w.length > 0);
            words.forEach((word, index) => {
                const spawnPos = this.sceneManager.getSpawnPositionInFrontOfCamera(index, words.length);
                this.objectManager.spawnNameTag(word, null, 1, spawnPos);
            });
            input.value = '';
        });

        // Mode Buttons
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                modeBtns.forEach(b => b.classList.remove('mode-active'));
                e.target.classList.add('mode-active');

                if (e.target.id === 'btn-mode-move') this.inputManager.currentMode = 'move';
                if (e.target.id === 'btn-mode-connect') this.inputManager.currentMode = 'connect';

                this.inputManager.connectStartObj = null;
            });
        });

        // Delete Button
        document.getElementById('btn-delete').addEventListener('click', () => {
            this.objectManager.deleteSelection(this.inputManager.selectedObjects);
            this.inputManager.selectedObjects = [];
            this.inputManager.updateSelection(null);
        });

        // Save Button (Library)
        document.getElementById('btn-save').addEventListener('click', () => {
            if (this.inputManager.selectedObjects.length === 0) {
                alert("保存する名札を選択してください。");
                return;
            }
            this.inputManager.selectedObjects.forEach(obj => {
                if(obj.userData.isGroup || obj.userData.isConnection) return;
                const data = obj.userData;
                this.objectManager.addToLibrary({
                    word: data.word,
                    colorHexStr: data.colorHexStr,
                    scale: obj.scale.x
                });
            });
        });

        // Gyro Toggle (New)
        const btnGyro = document.getElementById('btn-gyro');
        if(btnGyro) {
            btnGyro.addEventListener('click', () => {
                this.inputManager.isGyroEnabled = !this.inputManager.isGyroEnabled;
                btnGyro.classList.toggle('mode-active');
                if(this.inputManager.isGyroEnabled) {
                     // Request permission for iOS 13+
                     if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                        DeviceOrientationEvent.requestPermission()
                            .then(response => {
                                if (response == 'granted') {
                                    // Permission granted
                                }
                            })
                            .catch(console.error);
                    }
                }
            });
        }
    }

    renderLibraryUI() {
        const container = document.getElementById('library-container');
        const emptyMsg = document.getElementById('empty-lib-msg');
        container.innerHTML = '';

        if (this.objectManager.library.length === 0) {
            if(emptyMsg) {
                container.appendChild(emptyMsg);
                emptyMsg.style.display = 'block';
            }
            return;
        }
        if(emptyMsg) emptyMsg.style.display = 'none';

        this.objectManager.library.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'bg-gray-800 p-3 rounded-lg border border-gray-600 flex justify-between items-center hover:border-blue-400 transition-colors cursor-pointer';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-6 h-6 rounded-md shadow-inner" style="background-color: ${item.colorHexStr}; border: 1px solid rgba(255,255,255,0.2)"></div>
                    <div>
                        <p class="text-sm font-bold text-white truncate max-w-[120px]">${item.word}</p>
                        <p class="text-[10px] text-gray-400">Scale: ${item.scale.toFixed(1)}x</p>
                    </div>
                </div>
                <button class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900 bg-opacity-30">出す</button>
            `;
            div.addEventListener('click', () => {
                const spawnPos = this.sceneManager.getSpawnPositionInFrontOfCamera();
                this.objectManager.spawnNameTag(item.word, item.colorHexStr, item.scale, spawnPos);
            });
            container.appendChild(div);
        });
    }

    spawnInitialObjects() {
        const initialWords = ["江戸", "御館様", "思考", "役割", "概念"];
        initialWords.forEach((word, index) => {
            setTimeout(() => {
                const pos = this.sceneManager.getSpawnPositionInFrontOfCamera(index, initialWords.length);
                this.objectManager.spawnNameTag(word, null, 1, pos);
            }, index * 300);
        });
    }

    startLoop() {
        this.sceneManager.renderer.setAnimationLoop(this.render.bind(this));
    }

    render() {
        const time = Date.now() * 0.001;

        this.inputManager.updateMovement();
        this.xrManager.update();

        // Floating Animation
        this.objectManager.objects.forEach((obj, idx) => {
            if(!obj.userData.isConnection && !this.inputManager.selectedObjects.includes(obj) && !this.inputManager.isDragging) {
                obj.position.y += Math.sin(time + idx) * 0.005;
                if (obj.userData.isGroup || obj.userData.isNameTag) {
                    obj.quaternion.slerp(this.sceneManager.camera.quaternion, 0.05);
                }
            }
             // Scale Animation
             if (obj.userData.targetScale !== undefined) {
                const currentScale = obj.scale.x;
                const diff = obj.userData.targetScale - currentScale;
                if (Math.abs(diff) > 0.001) {
                    const newScale = currentScale + diff * 0.15;
                    obj.scale.setScalar(newScale);
                }
            }
        });

        this.sceneManager.render();
    }
}

new App();

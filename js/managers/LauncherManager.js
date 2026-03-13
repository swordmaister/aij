export class LauncherManager {
    constructor(onModeSelect) {
        this.launcher = document.getElementById('launcher');
        this.btnDesktop = document.getElementById('btn-desktop');
        this.btnMobile = document.getElementById('btn-mobile');
        this.btnVR = document.getElementById('btn-vr');
        this.onModeSelect = onModeSelect;

        this.setupListeners();
    }

    setupListeners() {
        if(this.btnDesktop) this.btnDesktop.addEventListener('click', () => this.selectMode('desktop'));
        if(this.btnMobile) this.btnMobile.addEventListener('click', () => this.selectMode('mobile'));
        if(this.btnVR) this.btnVR.addEventListener('click', () => this.selectMode('vr'));
    }

    selectMode(mode) {
        // Hide Launcher
        if(this.launcher) this.launcher.style.display = 'none';

        // Setup UI for mode
        const uiLeft = document.getElementById('ui-left');
        const uiRight = document.getElementById('ui-right');
        const status = document.getElementById('connection-status');

        if (mode === 'vr') {
            // VR Mode: Hide HTML UI
            // VRButton will be shown by SceneManager
        } else {
            // Desktop/Mobile: Show HTML UI
            if(uiLeft) uiLeft.classList.remove('hidden');
            if(uiRight) uiRight.classList.remove('hidden');
            if(status) status.classList.remove('hidden');
        }

        // Setup Mobile Toggles
        if (mode === 'mobile' || window.innerWidth < 768) {
            this.setupMobileToggles();
        }

        this.onModeSelect(mode);
    }

    setupMobileToggles() {
        const leftToggle = document.getElementById('ui-toggle-left');
        const rightToggle = document.getElementById('ui-toggle-right');
        const uiLeft = document.getElementById('ui-left');
        const uiRight = document.getElementById('ui-right');

        if(leftToggle && uiLeft) {
            leftToggle.addEventListener('click', () => {
                uiLeft.classList.toggle('-translate-x-full');
            });
        }

        if(rightToggle && uiRight) {
            rightToggle.addEventListener('click', () => {
                uiRight.classList.toggle('translate-x-full');
            });
        }
    }
}

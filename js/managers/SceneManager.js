import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { VRButton } from 'https://unpkg.com/three@0.128.0/examples/jsm/webxr/VRButton.js';

export class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0f172a, 0.02);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 15);
        this.camera.rotation.order = 'YXZ';

        // WebXR enabled renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true; // Prepare for XR
        this.container.appendChild(this.renderer.domElement);

        document.body.appendChild( VRButton.createButton( this.renderer ) );

        this.setupLights();
        this.setupGrid();

        window.addEventListener('resize', this.onResize.bind(this));
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);
    }

    setupGrid() {
        const gridHelper = new THREE.GridHelper(50, 50, 0x3b82f6, 0x1e293b);
        gridHelper.position.y = -5;
        this.scene.add(gridHelper);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // Helper to get spawn position relative to camera
    getSpawnPositionInFrontOfCamera(offsetIndex = 0, totalItems = 1) {
        const distance = 8;
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        const basePos = this.camera.position.clone().add(camDir.multiplyScalar(distance));
        const rightDir = new THREE.Vector3().crossVectors(this.camera.up, camDir).normalize();

        const offsetX = (offsetIndex - (totalItems - 1) / 2) * 4;
        basePos.y = Math.max(basePos.y, 1);

        return basePos.add(rightDir.multiplyScalar(offsetX));
    }
}

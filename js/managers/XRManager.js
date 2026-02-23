import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.128.0/examples/jsm/webxr/XRControllerModelFactory.js';

export class XRManager {
    constructor(sceneManager, objectManager) {
        this.sceneManager = sceneManager;
        this.objectManager = objectManager;
        this.scene = sceneManager.scene;
        this.renderer = sceneManager.renderer;
        this.camera = sceneManager.camera;

        this.controllers = [];
        this.controllerGrips = [];

        // Locomotion Group (Dolly)
        this.dolly = new THREE.Group();
        this.dolly.position.set(0, 0, 0);
        this.dolly.add(this.camera);
        this.scene.add(this.dolly);

        this.raycaster = new THREE.Raycaster();
        this.intersected = [];
        this.tempMatrix = new THREE.Matrix4();

        // State
        this.draggingController = null;
        this.draggedObject = null;
        this.dragOffset = new THREE.Vector3();

        this.currentMode = 'move';
        this.connectStartObj = null;
        this.buttonPressed = false;

        this.setupControllers();
        this.createWristUI();
    }

    updateWristUI() {
        if (!this.wristUI) return;
        const canvas = this.wristUI.material.map.image;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0,0,256,128);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.fillText(`Mode: ${this.currentMode.toUpperCase()}`, 20, 40);
        ctx.fillText(this.currentMode === 'move' ? '(Grip to Grab)' : '(Trigger to Connect)', 20, 70);
        ctx.fillText('(Press A to Toggle)', 20, 100);
        this.wristUI.material.map.needsUpdate = true;
    }

    setupControllers() {
        const controllerModelFactory = new XRControllerModelFactory();

        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);

            controller.addEventListener('selectstart', this.onSelectStart.bind(this));
            controller.addEventListener('selectend', this.onSelectEnd.bind(this));
            controller.addEventListener('squeezestart', this.onSqueezeStart.bind(this));
            controller.addEventListener('squeezeend', this.onSqueezeEnd.bind(this));

            controller.addEventListener('connected', (event) => {
                controller.userData.gamepad = event.data.gamepad;
                controller.userData.handedness = event.data.handedness;

                if (event.data.handedness === 'left') {
                    // Attach Wrist UI to Left Controller Grip or Controller itself
                    if (this.wristUI) {
                        controller.add(this.wristUI);
                    }
                }
            });

            this.dolly.add(controller);
            this.controllers.push(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            grip.add(controllerModelFactory.createControllerModel(grip));
            this.dolly.add(grip);
            this.controllerGrips.push(grip);

            // Add Ray Line
            const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
            const line = new THREE.Line(geometry);
            line.name = 'line';
            line.scale.z = 5;
            controller.add(line);
        }
    }

    createWristUI() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0,0,256,128);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.fillText('VR Mode: Move', 20, 40);
        ctx.fillText('(Grip to Grab)', 20, 70);

        const texture = new THREE.CanvasTexture(canvas);
        const geometry = new THREE.PlaneGeometry(0.15, 0.08);
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        this.wristUI = new THREE.Mesh(geometry, material);
        // Position on top of wrist
        this.wristUI.position.set(0, 0.05, 0.1);
        this.wristUI.rotation.x = -Math.PI / 4;
    }

    onSelectStart(event) {
        const controller = event.target;
        const intersections = this.getIntersections(controller);

        if (intersections.length > 0) {
            const object = intersections[0].object;

            if (this.currentMode === 'connect') {
                if (!this.connectStartObj) {
                    this.connectStartObj = object;
                    // Visual feedback could be added here
                } else if (this.connectStartObj !== object) {
                    this.objectManager.createConnection(this.connectStartObj, object, 0.1);
                    this.connectStartObj = null;
                }
                return;
            }

            // Handle grabbing
            this.draggedObject = object;
            this.draggingController = controller;

            this.tempMatrix.getInverse(controller.matrixWorld);
            object.matrix.premultiply(this.tempMatrix);
            object.matrix.decompose(object.position, object.quaternion, object.scale);

            controller.add(object);

            this.dragStartPos = object.position.clone();
            this.dragStartQuat = object.quaternion.clone();

            controller.userData.isSelecting = true;
        }
    }

    onSelectEnd(event) {
        const controller = event.target;
        if (controller.userData.isSelecting) {
            if (this.draggedObject) {
                const object = this.draggedObject;
                this.scene.attach(object); // Re-attach to scene world coordinates

                // History
                if (this.objectManager.historyManager && this.dragStartPos) {
                    if (this.dragStartPos.distanceTo(object.position) > 0.01) {
                        this.objectManager.historyManager.push({
                            type: 'move',
                            moves: [{ obj: object, oldPos: this.dragStartPos, oldQuat: this.dragStartQuat }]
                        });
                    }
                }

                if (this.objectManager.networkManager && object.userData.id) {
                    this.objectManager.networkManager.saveNode(object);
                }

                this.draggedObject = null;
                this.draggingController = null;
            }
            controller.userData.isSelecting = false;
        }
    }

    onSqueezeStart(event) {
        // Handle locomotion teleport or secondary action
        event.target.userData.isSqueezing = true;
    }

    onSqueezeEnd(event) {
        event.target.userData.isSqueezing = false;
    }

    getIntersections(controller) {
        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
        return this.raycaster.intersectObjects(this.objectManager.objects, true);
    }

    update() {
        // Handle Locomotion from Gamepads
        this.controllers.forEach((controller) => {
            if (controller.userData.gamepad) {
                const gamepad = controller.userData.gamepad;
                const handedness = controller.userData.handedness;

                // Move with Left Stick (axes[2], axes[3])
                if (handedness === 'left' && gamepad.axes.length >= 4) {
                    const dx = gamepad.axes[2]; // X axis
                    const dy = gamepad.axes[3]; // Y axis (forward/back)

                    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                        const speed = 0.1;
                        // Move dolly relative to camera direction
                        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                        forward.y = 0; forward.normalize();
                        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
                        right.y = 0; right.normalize();

                        this.dolly.position.addScaledVector(forward, -dy * speed);
                        this.dolly.position.addScaledVector(right, dx * speed);
                    }
                }

                // Turn with Right Stick (axes[2])
                if (handedness === 'right' && gamepad.axes.length >= 4) {
                    const dx = gamepad.axes[2];
                    if (Math.abs(dx) > 0.5) {
                        // Snap turn
                        if (!controller.userData.hasTurned) {
                            this.dolly.rotation.y -= Math.sign(dx) * Math.PI / 4;
                            controller.userData.hasTurned = true;
                        }
                    } else {
                        controller.userData.hasTurned = false;
                    }
                }

                // Toggle Mode with Button 4 ('A' on Oculus Touch Right) or Button 0 ('X' on Left)
                // Just checking button 4 for Right Hand usually covers 'A'
                if (handedness === 'right' && gamepad.buttons[4] && gamepad.buttons[4].pressed) {
                    if (!this.buttonPressed) {
                        this.currentMode = this.currentMode === 'move' ? 'connect' : 'move';
                        this.connectStartObj = null;
                        this.updateWristUI();
                        this.buttonPressed = true;
                    }
                } else if (handedness === 'right' && gamepad.buttons[4] && !gamepad.buttons[4].pressed) {
                    this.buttonPressed = false;
                }
            }
        });

        // Visual Ray
        this.controllers.forEach((controller) => {
             const line = controller.getObjectByName('line');
             if (line) {
                 const intersections = this.getIntersections(controller);
                 if (intersections.length > 0) {
                     line.scale.z = intersections[0].distance;
                 } else {
                     line.scale.z = 5;
                 }
             }
        });
    }
}

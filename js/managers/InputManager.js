import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { DeviceOrientationControls } from 'https://unpkg.com/three@0.128.0/examples/jsm/controls/DeviceOrientationControls.js';

export class InputManager {
    constructor(sceneManager, objectManager) {
        this.sceneManager = sceneManager;
        this.objectManager = objectManager;
        this.camera = sceneManager.camera;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        // Interaction State
        this.selectedObjects = [];
        this.currentMode = 'move';
        this.connectStartObj = null;

        this.isDragging = false;
        this.dragOffsets = new Map();
        this.dragStartPositions = new Map();

        this.draggedConnection = null;
        this.draggedConnectionEnd = null; // 'A' or 'B'
        this.draggedConnectionOriginalNode = null;

        // Camera Look
        this.isLooking = false;
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Mobile Gyro State
        this.isGyroEnabled = false;
        this.deviceOrientationControls = new DeviceOrientationControls(this.camera);
        this.deviceOrientationControls.enabled = false; // Initially disabled

        // Touch State
        this.pointers = new Map();
        this.prevPinchDist = 0;

        // Walk State
        this.walkState = { forward: false, backward: false, left: false, right: false, up: false, down: false, dash: false };
        this.velocityY = 0;
        this.isGrounded = true;

        this.setupEventListeners();
        this.setupKeyboardListeners();
    }

    setupEventListeners() {
        window.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        window.addEventListener('pointercancel', this.onPointerCancel.bind(this));
        window.addEventListener('wheel', this.onWheel.bind(this));
    }

    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch(e.code) {
                case 'KeyW': this.walkState.forward = true; break;
                case 'KeyS': this.walkState.backward = true; break;
                case 'KeyA': this.walkState.left = true; break;
                case 'KeyD': this.walkState.right = true; break;
                case 'KeyE': this.walkState.up = true; break;
                case 'KeyQ': this.walkState.down = true; break;
                case 'ShiftLeft':
                case 'ShiftRight': this.walkState.dash = true; break;
                case 'Space':
                    if (this.isGrounded) {
                        this.velocityY = 0.35;
                        this.isGrounded = false;
                    }
                    e.preventDefault();
                    break;
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch(e.code) {
                case 'KeyW': this.walkState.forward = false; break;
                case 'KeyS': this.walkState.backward = false; break;
                case 'KeyA': this.walkState.left = false; break;
                case 'KeyD': this.walkState.right = false; break;
                case 'KeyE': this.walkState.up = false; break;
                case 'KeyQ': this.walkState.down = false; break;
                case 'ShiftLeft':
                case 'ShiftRight': this.walkState.dash = false; break;
            }
        });
    }

    onPointerDown(event) {
        if (event.target.tagName !== 'CANVAS') return;

        this.pointers.set(event.pointerId, event);

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.objectManager.objects, true);

        if (intersects.length > 0) {
            let object = intersects[0].object;
            if (object.parent && object.parent.userData.isGroup) {
                object = object.parent;
            }

            const isMultiSelect = event.ctrlKey || event.metaKey;

            if (this.currentMode === 'move') {
                // Connection Dragging
                if (object.userData.isConnection) {
                    const conn = object.userData.connObj;
                    const hitPoint = intersects[0].point;

                    const posA = new THREE.Vector3();
                    if(conn.objA) conn.objA.getWorldPosition(posA); else posA.copy(conn.floatingPosA);

                    const posB = new THREE.Vector3();
                    if(conn.objB) conn.objB.getWorldPosition(posB); else posB.copy(conn.floatingPosB);

                    const distA = hitPoint.distanceTo(posA);
                    const distB = hitPoint.distanceTo(posB);

                    this.draggedConnection = conn;
                    this.isDragging = true;
                    this.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.plane.normal), hitPoint);

                    if (distA < distB) {
                        this.draggedConnectionEnd = 'A';
                        this.draggedConnectionOriginalNode = conn.objA;
                        conn.objA = null;
                        conn.floatingPosA.copy(hitPoint);
                    } else {
                        this.draggedConnectionEnd = 'B';
                        this.draggedConnectionOriginalNode = conn.objB;
                        conn.objB = null;
                        conn.floatingPosB.copy(hitPoint);
                    }

                    document.body.style.cursor = 'grabbing';
                    return;
                }

                if (!this.selectedObjects.includes(object)) {
                    this.updateSelection(object, isMultiSelect);
                }

                if (this.selectedObjects.length > 0) {
                    this.isDragging = true;
                    this.dragOffsets.clear();
                    this.dragStartPositions.clear();

                    this.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.plane.normal), this.selectedObjects[0].position);
                    const intersectPoint = new THREE.Vector3();
                    this.raycaster.ray.intersectPlane(this.plane, intersectPoint);

                    this.selectedObjects.forEach(obj => {
                        const offset = new THREE.Vector3().copy(intersectPoint).sub(obj.position);
                        this.dragOffsets.set(obj, offset);
                        this.dragStartPositions.set(obj, obj.position.clone());
                    });
                    document.body.style.cursor = 'grabbing';
                }
            } else if (this.currentMode === 'connect') {
                if (!this.connectStartObj) {
                    this.connectStartObj = object;
                    // Emissive logic skipped for brevity/complexity in refactor
                } else if (this.connectStartObj !== object) {
                    const thickness = parseFloat(document.getElementById('line-thickness')?.value || 0.1);
                    this.objectManager.createConnection(this.connectStartObj, object, thickness);
                    this.connectStartObj = null;
                    this.updateSelection(null);
                }
            }
        } else {
            this.updateSelection(null);
            this.connectStartObj = null;
            if (this.currentMode === 'move') {
                this.isLooking = true;
                this.lastMouseX = event.clientX;
                this.lastMouseY = event.clientY;
                document.body.style.cursor = 'grab';
            }
        }
    }

    onPointerMove(event) {
        this.pointers.set(event.pointerId, event);

        // Pinch Zoom Logic (2 fingers)
        if (this.pointers.size === 2) {
            const points = Array.from(this.pointers.values());
            const dx = points[0].clientX - points[1].clientX;
            const dy = points[0].clientY - points[1].clientY;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (this.prevPinchDist > 0) {
                const delta = dist - this.prevPinchDist;
                // Move camera forward/back based on pinch
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                this.camera.position.addScaledVector(forward, delta * 0.01);
            }
            this.prevPinchDist = dist;
            return;
        } else {
            this.prevPinchDist = 0;
        }

        if (this.isLooking) {
            const deltaX = event.clientX - this.lastMouseX;
            const deltaY = event.clientY - this.lastMouseY;
            const lookSpeed = 0.003;
            this.lookYaw -= deltaX * lookSpeed;
            this.lookPitch -= deltaY * lookSpeed;
            this.lookPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.lookPitch));
            this.camera.rotation.set(this.lookPitch, this.lookYaw, 0);
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
            return;
        }

        if (!this.isDragging || this.currentMode !== 'move') return;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.plane, intersectPoint);

        if (this.draggedConnection) {
            if (this.draggedConnectionEnd === 'A') this.draggedConnection.floatingPosA.copy(intersectPoint);
            if (this.draggedConnectionEnd === 'B') this.draggedConnection.floatingPosB.copy(intersectPoint);
            this.objectManager.updateConnections();
            return;
        }

        this.selectedObjects.forEach(obj => {
            const offset = this.dragOffsets.get(obj);
            if (offset) {
                obj.position.copy(intersectPoint).sub(offset);
            }
        });
        this.objectManager.updateConnections();
    }

    onPointerUp(event) {
        this.pointers.delete(event.pointerId);
        this.prevPinchDist = 0;

        if (this.isLooking) {
            this.isLooking = false;
            document.body.style.cursor = 'default';
            return;
        }

        if (this.draggedConnection) {
            // Check reconnect
             this.raycaster.setFromCamera(this.mouse, this.camera);
             const intersects = this.raycaster.intersectObjects(this.objectManager.objects, true);
             let targetNode = null;

             for(let hit of intersects) {
                 let hitObj = hit.object;
                 if(hitObj.parent && hitObj.parent.userData.isGroup) hitObj = hitObj.parent;
                 if(hitObj.userData.isConnection) continue;
                 if(hitObj.userData.isNameTag || hitObj.userData.isGroup) {
                     const otherNode = this.draggedConnectionEnd === 'A' ? this.draggedConnection.objB : this.draggedConnection.objA;
                     if(hitObj !== otherNode) {
                         targetNode = hitObj;
                         break;
                     }
                 }
             }

             if(targetNode) {
                 // History for reconnect
                 if (this.objectManager.historyManager) {
                     this.objectManager.historyManager.push({
                         type: 'reconnect',
                         conn: this.draggedConnection,
                         end: this.draggedConnectionEnd,
                         oldNode: this.draggedConnectionOriginalNode,
                         newNode: targetNode // This is actually redundant for undo but good for redo
                     });
                 }

                 if(this.draggedConnectionEnd === 'A') this.draggedConnection.objA = targetNode;
                 else this.draggedConnection.objB = targetNode;

                 // Sync connection change
                 if (this.objectManager.networkManager) {
                     this.objectManager.networkManager.saveConnection(this.draggedConnection);
                 }
             } else {
                 if(this.draggedConnectionEnd === 'A') this.draggedConnection.objA = this.draggedConnectionOriginalNode;
                 else this.draggedConnection.objB = this.draggedConnectionOriginalNode;
             }
             this.draggedConnection = null;
             this.objectManager.updateConnections();
        }

        if (this.isDragging && this.selectedObjects.length > 0) {
            // History for Move
            if (this.objectManager.historyManager) {
                const moves = [];
                let hasMoved = false;
                this.selectedObjects.forEach(obj => {
                    const startPos = this.dragStartPositions.get(obj);
                    if (startPos && startPos.distanceTo(obj.position) > 0.01) {
                        moves.push({ obj: obj, oldPos: startPos, oldQuat: obj.quaternion.clone() });
                        hasMoved = true;
                    }
                });
                if (hasMoved) {
                    this.objectManager.historyManager.push({ type: 'move', moves: moves });
                }
            }

            // Sync moved objects
            this.selectedObjects.forEach(obj => {
                if (this.objectManager.networkManager) {
                    this.objectManager.networkManager.saveNode(obj);
                }
            });
        }

        this.isDragging = false;
        document.body.style.cursor = 'default';
    }

    onPointerCancel(event) {
        this.pointers.delete(event.pointerId);
        this.prevPinchDist = 0;
        this.isLooking = false;
        this.isDragging = false;
        if(this.draggedConnection) {
             if(this.draggedConnectionEnd === 'A') this.draggedConnection.objA = this.draggedConnectionOriginalNode;
             else this.draggedConnection.objB = this.draggedConnectionOriginalNode;
             this.draggedConnection = null;
             this.objectManager.updateConnections();
        }
        document.body.style.cursor = 'default';
    }

    onWheel(event) {
        if (this.selectedObjects.length > 0 && this.currentMode === 'move') {
            const scaleDelta = event.deltaY > 0 ? 0.9 : 1.1;
            this.selectedObjects.forEach(obj => {
                if (obj.userData.baseScale !== undefined) {
                    obj.userData.baseScale *= scaleDelta;
                    obj.userData.baseScale = Math.max(0.2, Math.min(5.0, obj.userData.baseScale));
                    obj.userData.targetScale = obj.userData.baseScale * 1.05;
                }
            });
            this.objectManager.updateConnections();
        }
    }

    updateSelection(mesh, multiSelect = false) {
        if (!multiSelect) {
            this.selectedObjects.forEach(obj => {
                if (obj.userData.baseScale !== undefined) obj.userData.targetScale = obj.userData.baseScale;
                if (obj.userData.isConnection) obj.material.color.setHex(0x4ade80);
            });
            this.selectedObjects = [];
        }

        if (mesh) {
            const index = this.selectedObjects.indexOf(mesh);
            if (index > -1) {
                if (mesh.userData.baseScale !== undefined) mesh.userData.targetScale = mesh.userData.baseScale;
                if (mesh.userData.isConnection) mesh.material.color.setHex(0x4ade80);
                this.selectedObjects.splice(index, 1);
            } else {
                this.selectedObjects.push(mesh);
                if (mesh.userData.baseScale !== undefined) mesh.userData.targetScale = mesh.userData.baseScale * 1.05;
                if (mesh.userData.isConnection) mesh.material.color.setHex(0xffaa00);
            }
        }
    }

    updateMovement(deltaTime) {
        // Gyro Update
        if (this.isGyroEnabled && this.deviceOrientationControls) {
            this.deviceOrientationControls.update();
            // Sync manual look yaw/pitch to avoid jump when disabling (approximate)
            const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.lookYaw = euler.y;
            this.lookPitch = euler.x;
        }

        // WASD Movement Logic
        const moveSpeed = this.walkState.dash ? 0.35 : 0.15; // Simplified speed for now
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3().crossVectors(this.camera.up, camDir).normalize();
        const oldCamPos = this.camera.position.clone();
        let moved = false;

        if (this.walkState.forward) { this.camera.position.addScaledVector(camDir, moveSpeed); moved = true; }
        if (this.walkState.backward) { this.camera.position.addScaledVector(camDir, -moveSpeed); moved = true; }
        if (this.walkState.left) { this.camera.position.addScaledVector(camRight, moveSpeed); moved = true; }
        if (this.walkState.right) { this.camera.position.addScaledVector(camRight, -moveSpeed); moved = true; }
        if (this.walkState.up) { this.camera.position.y += moveSpeed; this.isGrounded = false; moved = true; }
        if (this.walkState.down) { this.camera.position.y -= moveSpeed; this.isGrounded = false; moved = true; }

        if (!this.isGrounded && !this.walkState.up && !this.walkState.down) {
            this.camera.position.y += this.velocityY;
            this.velocityY -= 0.02;
            moved = true;
            if (this.camera.position.y <= 5) {
                this.camera.position.y = 5;
                this.velocityY = 0;
                this.isGrounded = true;
            }
        } else if(this.walkState.up || this.walkState.down) {
            this.velocityY = 0;
        }

        // Dragging follow logic
        if (moved && this.isDragging && this.selectedObjects.length > 0) {
            const moveDelta = this.camera.position.clone().sub(oldCamPos);
            if (this.draggedConnection) {
                if (this.draggedConnectionEnd === 'A') this.draggedConnection.floatingPosA.add(moveDelta);
                if (this.draggedConnectionEnd === 'B') this.draggedConnection.floatingPosB.add(moveDelta);
            } else {
                this.selectedObjects.forEach(obj => {
                    obj.position.add(moveDelta);
                    const startPos = this.dragStartPositions.get(obj);
                    if (startPos) startPos.add(moveDelta);
                });
            }
            this.plane.translate(moveDelta);
            this.objectManager.updateConnections();
        }
    }
}

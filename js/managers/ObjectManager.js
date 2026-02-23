import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

export class ObjectManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.scene;

        this.objects = [];
        this.connections = [];
        this.library = [];
        this.networkManager = null; // Set later
        this.historyManager = null;
        this.onLibraryUpdate = null;
    }

    setNetworkManager(nm) {
        this.networkManager = nm;
    }

    setHistoryManager(hm) {
        this.historyManager = hm;
    }

    createNameTagTexture(text, baseColor) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = 'bold 64px "Segoe UI", sans-serif';
        ctx.font = font;

        const textWidth = ctx.measureText(text).width;
        const width = Math.max(300, textWidth + 100);
        const height = 150;

        canvas.width = width;
        canvas.height = height;

        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.roundRect(0, 0, width, height, 30);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(text, width / 2, height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = this.sceneManager.renderer.capabilities.getMaxAnisotropy();
        return { texture, aspect: width / height };
    }

    spawnNameTag(word, colorHexStr = null, customScale = 1, specificPosition = null, id = null, fromNetwork = false) {
        const color = new THREE.Color();
        if (colorHexStr) color.set(colorHexStr);
        else color.setHSL(Math.random(), 0.7, 0.4);
        const colorStr = '#' + color.getHexString();

        const { texture, aspect } = this.createNameTagTexture(word, colorStr);
        const geometry = new THREE.BoxGeometry(3 * aspect, 3, 0.2);

        const materials = [
            new THREE.MeshStandardMaterial({ color: color }),
            new THREE.MeshStandardMaterial({ color: color }),
            new THREE.MeshStandardMaterial({ color: color }),
            new THREE.MeshStandardMaterial({ color: color }),
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 }),
            new THREE.MeshStandardMaterial({ color: color })
        ];

        const mesh = new THREE.Mesh(geometry, materials);

        if (specificPosition) {
            mesh.position.copy(specificPosition);
        } else {
            // Default spawn position if none provided (usually overridden by caller)
            mesh.position.set(0, 5, 0);
        }

        mesh.userData = {
            id: id || THREE.MathUtils.generateUUID(),
            word: word,
            colorHexStr: colorStr,
            isNameTag: true,
            baseScale: customScale,
            targetScale: customScale
        };

        this.scene.add(mesh);
        this.objects.push(mesh);

        // Intro animation
        if (!fromNetwork) {
            mesh.scale.set(0,0,0);
            let s = 0;
            const animateIn = () => {
                s += 0.15;
                if(s <= customScale) {
                    mesh.scale.setScalar(s);
                    requestAnimationFrame(animateIn);
                } else {
                    mesh.scale.setScalar(customScale);
                }
            };
            animateIn();

            // Sync to Network
            if (this.networkManager) {
                this.networkManager.saveNode(mesh);
            }

        // History
        if (!fromNetwork && this.historyManager) {
            this.historyManager.push({ type: 'add', objects: [mesh] });
        }

        } else {
            mesh.scale.setScalar(customScale);
        }

        return mesh;
    }

    createConnection(objA, objB, thickness = 0.1, id = null, fromNetwork = false) {
        const exists = this.connections.some(c =>
            (c.objA === objA && c.objB === objB) || (c.objA === objB && c.objB === objA)
        );
        if(exists) return null;

        const geometry = new THREE.CylinderGeometry(thickness, thickness, 1, 8);
        geometry.rotateX(Math.PI / 2);

        const material = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.8 });
        const cylinder = new THREE.Mesh(geometry, material);

        this.scene.add(cylinder);

        const connObj = {
            id: id || THREE.MathUtils.generateUUID(),
            mesh: cylinder,
            objA: objA,
            objB: objB,
            thickness: thickness,
            floatingPosA: new THREE.Vector3(),
            floatingPosB: new THREE.Vector3()
        };

        cylinder.userData = { isConnection: true, connObj: connObj };
        this.objects.push(cylinder);
        this.connections.push(connObj);

        this.updateConnections();

        if (!fromNetwork && this.networkManager) {
            this.networkManager.saveConnection(connObj);
        }

        if (!fromNetwork && this.historyManager) {
            this.historyManager.push({ type: 'connect', connection: connObj });
        }

        return connObj;
    }

    updateConnections() {
        this.connections.forEach(conn => {
            const posA = new THREE.Vector3();
            const posB = new THREE.Vector3();

            if (conn.objA) conn.objA.getWorldPosition(posA);
            else posA.copy(conn.floatingPosA);

            if (conn.objB) conn.objB.getWorldPosition(posB);
            else posB.copy(conn.floatingPosB);

            const distance = posA.distanceTo(posB);

            if (distance > 0.001) {
                conn.mesh.scale.set(1, 1, distance);
                const midpoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
                conn.mesh.position.copy(midpoint);
                conn.mesh.lookAt(posB);
            }
        });
    }

    createGroup(selectedObjects, id = null, fromNetwork = false) {
        if (selectedObjects.length < 2 && !fromNetwork) return null;

        const group = new THREE.Group();

        // Calculate Center & Size
        const groupBBox = new THREE.Box3();
        selectedObjects.forEach(obj => {
            const objBBox = new THREE.Box3().setFromObject(obj);
            groupBBox.union(objBBox);
        });

        groupBBox.expandByScalar(0.5);
        const center = new THREE.Vector3();
        groupBBox.getCenter(center);
        const size = new THREE.Vector3();
        groupBBox.getSize(size);

        // Visual Box (Placeholder, updated below)
        const encloseGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const encloseMat = new THREE.MeshStandardMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.15,
            roughness: 0.1,
            metalness: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const encloseMesh = new THREE.Mesh(encloseGeo, encloseMat);
        encloseMesh.name = 'groupVisual';
        group.add(encloseMesh);

        group.position.copy(center);
        group.quaternion.copy(this.scene.camera.quaternion);

        // Attach children
        selectedObjects.forEach(obj => {
            group.attach(obj);
            const idx = this.objects.indexOf(obj);
            if(idx > -1) this.objects.splice(idx, 1);
        });

        group.userData = {
            id: id || THREE.MathUtils.generateUUID(),
            isGroup: true,
            word: "グループ",
            baseScale: 1,
            targetScale: 1
        };

        this.scene.add(group);
        this.objects.push(group);

        // Sync
        if (!fromNetwork && this.networkManager) {
            this.networkManager.saveNode(group);
            selectedObjects.forEach(obj => this.networkManager.saveNode(obj)); // Update parent_id
        }

        if (!fromNetwork && this.historyManager) {
            this.historyManager.push({ type: 'group', group: group, children: [...selectedObjects] });
        }

        return group;
    }

    removeObject(obj, removeConnections = true, fromNetwork = false, fromHistory = false) {
        // Ungroup logic if it's a group
        if (obj.userData.isGroup) {
            const childrenToExtract = [];
            obj.children.forEach(child => {
                if (child.userData && (child.userData.isNameTag || child.userData.isGroup)) {
                    childrenToExtract.push(child);
                }
            });

            childrenToExtract.forEach(child => {
                this.scene.attach(child);
                this.objects.push(child);
                if (!fromNetwork && this.networkManager) {
                    this.networkManager.saveNode(child); // Update parent_id to null
                }
            });
        }

        if (removeConnections) {
            for (let i = this.connections.length - 1; i >= 0; i--) {
                let isConnected = false;
                obj.traverse(child => {
                    if (this.connections[i].objA === child || this.connections[i].objB === child ||
                        this.connections[i].objA === obj || this.connections[i].objB === obj) {
                        isConnected = true;
                    }
                });
                if (isConnected) {
                    const conn = this.connections[i];
                    if (!fromNetwork && this.networkManager) {
                        this.networkManager.deleteConnection(conn.id);
                    }
                    this.scene.remove(conn.mesh);
                    const connObjIdx = this.objects.indexOf(conn.mesh);
                    if (connObjIdx > -1) this.objects.splice(connObjIdx, 1);
                    this.connections.splice(i, 1);
                }
            }
        }

        if (!fromNetwork && this.networkManager && obj.userData.id) {
            this.networkManager.deleteNode(obj.userData.id);
        }

        this.scene.remove(obj);
        const index = this.objects.indexOf(obj);
        if (index > -1) this.objects.splice(index, 1);
    }

    getObjectById(id) {
        // Search in top level objects
        let found = this.objects.find(obj => obj.userData.id === id);
        if (found) return found;

        this.scene.traverse(obj => {
            if (obj.userData.id === id) found = obj;
        });
        return found;
    }

    deleteSelection(objects) {
        if (objects.length === 0) return;

        const deletedObjects = [];
        const deletedConnections = [];
        const ungroupedGroups = []; // Store groups that were ungrouped

        // Clone array because we might modify it or its references
        const targets = [...objects];

        for (let i = targets.length - 1; i >= 0; i--) {
            const obj = targets[i];

            if (obj.userData.isConnection) {
                const conn = obj.userData.connObj;
                deletedConnections.push(conn);
                this.removeObject(obj, false, false, true); // Don't remove recursive connections
            } else if (obj.userData.isGroup) {
                // Store children for undo
                const children = [];
                obj.children.forEach(c => {
                    if(c.userData.isNameTag || c.userData.isGroup) children.push(c);
                });
                ungroupedGroups.push({ group: obj, children: children });

                this.removeObject(obj, true, false, true);
            } else {
                // Normal node
                deletedObjects.push(obj);

                // Identify connections to be removed
                for (let j = this.connections.length - 1; j >= 0; j--) {
                    let isConnected = false;
                    const conn = this.connections[j];
                    obj.traverse(child => {
                        if (conn.objA === child || conn.objB === child ||
                            conn.objA === obj || conn.objB === obj) {
                            isConnected = true;
                        }
                    });

                    if (isConnected) {
                        deletedConnections.push(conn);
                        // removeObject will handle connection removal visually, but we need to track it for history
                    }
                }

                this.removeObject(obj, true, false, true);
            }
        }

        if (this.historyManager) {
            if (deletedObjects.length > 0 || deletedConnections.length > 0) {
                this.historyManager.push({ type: 'delete', objects: deletedObjects, connections: deletedConnections });
            }
            if (ungroupedGroups.length > 0) {
                ungroupedGroups.forEach(g => {
                    this.historyManager.push({ type: 'ungroup', group: g.group, children: g.children });
                });
            }
        }
    }

    updateGroupVisual(group) {
        if (!group || !group.userData.isGroup) return;

        const oldVisual = group.getObjectByName('groupVisual');
        if (oldVisual) group.remove(oldVisual);

        const groupBBox = new THREE.Box3();
        let hasChildren = false;

        group.updateMatrixWorld(true);

        // Use World BBox of children, then transform to local
        group.children.forEach(child => {
            if (child.userData.isNameTag || child.userData.isGroup) {
                const box = new THREE.Box3().setFromObject(child); // World AABB
                groupBBox.union(box);
                hasChildren = true;
            }
        });

        if (!hasChildren) return;

        // Convert world bbox to local space
        // We can't strictly convert an AABB to another AABB with rotation,
        // but for visual approximation we typically just want the size and center in local space.
        // Actually, since we want the box to encompass children, we can just transform all child vertices... expensive.
        // Or simplified: Just use the world AABB size/center and apply inverse world matrix of group?

        const invMatrix = new THREE.Matrix4().getInverse(group.matrixWorld);
        groupBBox.applyMatrix4(invMatrix);

        const size = new THREE.Vector3();
        groupBBox.getSize(size);
        const center = new THREE.Vector3();
        groupBBox.getCenter(center);

        const encloseGeo = new THREE.BoxGeometry(size.x + 0.5, size.y + 0.5, size.z + 0.5);
        const encloseMat = new THREE.MeshStandardMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.15,
            roughness: 0.1,
            metalness: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const encloseMesh = new THREE.Mesh(encloseGeo, encloseMat);
        encloseMesh.position.copy(center);
        encloseMesh.name = 'groupVisual';
        group.add(encloseMesh);
    }

    // --- Library ---

    loadRemoteLibrary(items) {
        this.library = items;
        if (this.onLibraryUpdate) this.onLibraryUpdate();
    }

    addToLibrary(item) {
        // Check duplicate?
        // Generate ID if missing
        if (!item.id) item.id = THREE.MathUtils.generateUUID();

        this.library.push(item);
        if (this.networkManager) this.networkManager.saveLibraryItem(item);
        if (this.onLibraryUpdate) this.onLibraryUpdate();
    }

    // --- Remote Sync Helpers ---

    spawnRemoteNode(data) {
        // Check if exists
        if (this.objects.some(obj => obj.userData.id === data.id)) return;

        if (data.type === 'group') {
            const group = new THREE.Group();
            group.position.set(data.x, data.y, data.z);
            group.quaternion.set(data.qx, data.qy, data.qz, data.qw);
            group.userData = {
                id: data.id,
                isGroup: true,
                word: data.word || "グループ",
                baseScale: data.scale || 1,
                targetScale: data.scale || 1
            };

            // Placeholder visual
            const encloseGeo = new THREE.BoxGeometry(1, 1, 1);
            const encloseMat = new THREE.MeshStandardMaterial({
                color: 0xa855f7,
                transparent: true,
                opacity: 0.15,
                roughness: 0.1,
                metalness: 0.2,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const encloseMesh = new THREE.Mesh(encloseGeo, encloseMat);
            encloseMesh.name = 'groupVisual';
            group.add(encloseMesh);

            this.scene.add(group);
            this.objects.push(group);
        } else {
            const pos = new THREE.Vector3(data.x, data.y, data.z);
            this.spawnNameTag(data.word, data.color, data.scale, pos, data.id, true);
        }
    }

    updateRemoteNode(data) {
        const node = this.getObjectById(data.id);
        if (node) {
            node.position.set(data.x, data.y, data.z);
            node.quaternion.set(data.qx, data.qy, data.qz, data.qw);

            if (node.userData.isGroup) {
                // Update Group Visual if needed (e.g. if children moved inside?)
                // Actually, if children moved, they call saveNode, which updates themselves.
                // Group itself usually moves as a whole.
            }

            this.updateConnections();
        }
    }

    removeRemoteNode(id) {
        const node = this.objects.find(obj => obj.userData.id === id);
        if (node) {
            this.removeObject(node, true, true);
        }
    }

    spawnRemoteConnection(data) {
        if (this.connections.some(c => c.id === data.id)) return;

        const nodeA = this.objects.find(obj => obj.userData.id === data.from_node);
        const nodeB = this.objects.find(obj => obj.userData.id === data.to_node);

        if (nodeA && nodeB) {
            this.createConnection(nodeA, nodeB, data.thickness, data.id, true);
        }
    }

    removeRemoteConnection(id) {
        const index = this.connections.findIndex(c => c.id === id);
        if (index > -1) {
            const conn = this.connections[index];
            this.scene.remove(conn.mesh);
            const objIdx = this.objects.indexOf(conn.mesh);
            if(objIdx > -1) this.objects.splice(objIdx, 1);
            this.connections.splice(index, 1);
        }
    }
}

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export class NetworkManager {
    constructor(objectManager) {
        this.objectManager = objectManager;
        this.client = null;
        this.channel = null;
        this.isConnected = false;

        // Status indicator
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');

        if (SUPABASE_URL && SUPABASE_KEY) {
            this.client = createClient(SUPABASE_URL, SUPABASE_KEY);
            this.init();
        } else {
            console.warn("Supabase credentials not found in js/config.js. Running in offline mode.");
            this.updateStatus("Offline (No Config)", "gray");
        }
    }

    updateStatus(text, color = "green") {
        if (this.statusText) this.statusText.textContent = text;
        if (this.statusIndicator) {
            this.statusIndicator.className = `w-2 h-2 rounded-full bg-${color}-500`;
            if(color === 'gray') this.statusIndicator.style.backgroundColor = 'gray';
            else if(color === 'green') this.statusIndicator.style.backgroundColor = '#22c55e';
            else if(color === 'red') this.statusIndicator.style.backgroundColor = '#ef4444';
            else if(color === 'yellow') this.statusIndicator.style.backgroundColor = '#eab308';
        }
    }

    async init() {
        try {
            this.updateStatus("Connecting...", "yellow");

            // Anonymous Auth
            const { data, error } = await this.client.auth.signInAnonymously();
            if (error) throw error;

            this.isConnected = true;
            this.updateStatus("Connected", "green");

            this.subscribeToChanges();
            this.loadInitialState();

        } catch (err) {
            console.error("Supabase Connection Error:", err);
            this.updateStatus("Connection Failed", "red");
        }
    }

    async loadInitialState() {
        // Load Nodes
        const { data: nodes, error: nodeError } = await this.client
            .from('nodes')
            .select('*');

        if (nodes) {
            // First pass: Create all objects
            nodes.forEach(node => {
                this.objectManager.spawnRemoteNode(node);
            });

            // Second pass: Reparenting
            nodes.forEach(node => {
                if (node.parent_id) {
                    const child = this.objectManager.getObjectById(node.id);
                    const parent = this.objectManager.getObjectById(node.parent_id);
                    if (child && parent) {
                        parent.attach(child);
                        // Child removed from main list if parented
                        const idx = this.objectManager.objects.indexOf(child);
                        if (idx > -1) this.objectManager.objects.splice(idx, 1);
                    }
                }
            });

            // Update group visuals
            this.objectManager.objects.forEach(obj => {
                if (obj.userData.isGroup) {
                    this.objectManager.updateGroupVisual(obj);
                }
            });
        }

        // Load Connections
        const { data: conns, error: connError } = await this.client
            .from('connections')
            .select('*');

        if (conns) {
            conns.forEach(conn => {
                this.objectManager.spawnRemoteConnection(conn);
            });
        }

        // Load Library
        const { data: libs } = await this.client.from('library').select('*');
        if (libs) {
            // Map DB columns to local object format if needed
            const formatted = libs.map(l => ({
                id: l.id,
                word: l.word,
                colorHexStr: l.color,
                scale: l.scale
            }));
            this.objectManager.loadRemoteLibrary(formatted);
        }
    }

    subscribeToChanges() {
        this.channel = this.client.channel('room1')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes' }, payload => {
                this.handleNodeChange(payload);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, payload => {
                this.handleConnectionChange(payload);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("Subscribed to realtime changes");
                }
            });
    }

    handleNodeChange(payload) {
        const { eventType, new: newRec, old: oldRec } = payload;
        if (eventType === 'INSERT') {
            this.objectManager.spawnRemoteNode(newRec);
        } else if (eventType === 'UPDATE') {
            this.objectManager.updateRemoteNode(newRec);
        } else if (eventType === 'DELETE') {
            this.objectManager.removeRemoteNode(oldRec.id);
        }
    }

    handleConnectionChange(payload) {
        const { eventType, new: newRec, old: oldRec } = payload;
        if (eventType === 'INSERT') {
            this.objectManager.spawnRemoteConnection(newRec);
        } else if (eventType === 'DELETE') {
            this.objectManager.removeRemoteConnection(oldRec.id);
        }
    }

    // --- Public Methods called by ObjectManager ---

    async saveNode(mesh) {
        if (!this.isConnected) return;

        const parentId = mesh.parent && mesh.parent.userData.id ? mesh.parent.userData.id : null;
        const type = mesh.userData.isGroup ? 'group' : 'node';

        const data = {
            id: mesh.userData.id,
            word: mesh.userData.word,
            color: mesh.userData.colorHexStr,
            scale: mesh.scale.x,
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
            qx: mesh.quaternion.x,
            qy: mesh.quaternion.y,
            qz: mesh.quaternion.z,
            qw: mesh.quaternion.w,
            parent_id: parentId,
            type: type
        };
        await this.client.from('nodes').upsert(data);
    }

    async deleteNode(id) {
        if (!this.isConnected) return;
        await this.client.from('nodes').delete().eq('id', id);
    }

    async saveConnection(connObj) {
        if (!this.isConnected) return;

        // Ensure connected nodes have IDs (they should)
        const nodeAId = connObj.objA?.userData?.id;
        const nodeBId = connObj.objB?.userData?.id;

        if (!nodeAId || !nodeBId) return;

        const data = {
            id: connObj.id,
            from_node: nodeAId,
            to_node: nodeBId,
            thickness: connObj.thickness
        };
        await this.client.from('connections').upsert(data);
    }

    async deleteConnection(id) {
        if (!this.isConnected) return;
        await this.client.from('connections').delete().eq('id', id);
    }

    async saveLibraryItem(item) {
        if (!this.isConnected) return;
        const data = {
            id: item.id,
            word: item.word,
            color: item.colorHexStr,
            scale: item.scale
        };
        await this.client.from('library').upsert(data);
    }
}

export class HistoryManager {
    constructor(objectManager) {
        this.objectManager = objectManager;
        this.undoStack = [];
        this.redoStack = []; // Optional
        this.btnUndo = document.getElementById('btn-undo');

        if (this.btnUndo) {
            this.btnUndo.addEventListener('click', () => this.undo());
        }
    }

    push(command) {
        this.undoStack.push(command);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
        this.updateUI();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const cmd = this.undoStack.pop();

        // We don't implement Redo fully in this prototype, but we keep the command in case we want to.
        // To implement Redo, we'd need to push to redoStack and handle re-execution.
        // Here we just focus on Undo.

        switch (cmd.type) {
            case 'add':
                // Objects were added. Undo = remove them.
                cmd.objects.forEach(obj => {
                    this.objectManager.removeObject(obj, true, false, true); // fromHistory=true
                });
                break;
            case 'delete':
                // Objects were deleted. Undo = re-add them.
                cmd.objects.forEach(obj => {
                    this.objectManager.scene.add(obj);
                    this.objectManager.objects.push(obj);
                    if (this.objectManager.networkManager) this.objectManager.networkManager.saveNode(obj);
                });
                cmd.connections.forEach(conn => {
                    this.objectManager.scene.add(conn.mesh);
                    this.objectManager.objects.push(conn.mesh);
                    this.objectManager.connections.push(conn);
                    if (this.objectManager.networkManager) this.objectManager.networkManager.saveConnection(conn);
                });
                this.objectManager.updateConnections();
                break;
            case 'move':
                // Objects moved. Undo = restore old position.
                cmd.moves.forEach(m => {
                    m.obj.position.copy(m.oldPos);
                    if (m.oldQuat) m.obj.quaternion.copy(m.oldQuat);

                    if (this.objectManager.networkManager) this.objectManager.networkManager.saveNode(m.obj);
                });
                this.objectManager.updateConnections();
                break;
            case 'connect':
                // Connection created. Undo = remove it.
                // We use removeObject logic for connection mesh?
                // Or remove from connections array.
                const conn = cmd.connection;
                this.objectManager.removeObject(conn.mesh, false, false, true);
                break;
            case 'group':
                // Group created. Undo = ungroup.
                this.objectManager.removeObject(cmd.group, false, false, true);
                break;
            case 'ungroup':
                // Group was deleted (ungrouped). Undo = restore group.
                const group = cmd.group;
                const children = cmd.children;

                this.objectManager.scene.add(group);
                this.objectManager.objects.push(group);

                children.forEach(child => {
                    group.attach(child);
                    const idx = this.objectManager.objects.indexOf(child);
                    if (idx > -1) this.objectManager.objects.splice(idx, 1);
                });

                this.objectManager.updateGroupVisual(group);

                if (this.objectManager.networkManager) {
                    this.objectManager.networkManager.saveNode(group);
                    children.forEach(c => this.objectManager.networkManager.saveNode(c));
                }
                break;
            case 'reconnect':
                if (cmd.end === 'A') cmd.conn.objA = cmd.oldNode;
                else cmd.conn.objB = cmd.oldNode;
                this.objectManager.updateConnections();
                if (this.objectManager.networkManager) this.objectManager.networkManager.saveConnection(cmd.conn);
                break;
        }

        this.updateUI();
    }

    updateUI() {
        if (this.btnUndo) this.btnUndo.disabled = this.undoStack.length === 0;
    }
}

class CmdMap {
    constructor() {
        this.commands = [];
        this.eventPlugins = [];
    }

    values() {
        return this.commands;
    }

    add(content) {
        this.commands.push(content);
    }

    events(content) {
        this.eventPlugins.push(content);
    }

    getEvents() {
        return this.eventPlugins;
    }

    reset() {
        this.commands = [];
    }

    size() {
        return this.commands.length;
    }
}

export default new CmdMap();
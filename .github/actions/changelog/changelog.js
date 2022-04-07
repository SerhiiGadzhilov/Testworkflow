const core = require('@actions/core');
const cp = require('child_process');
const fs = require('fs');

function Submodule(config) {
    var _self = this;
    var _name = "";
    var _path = "";
    var _url = "";
    var _revision = "";
    var _prev_revision = "";

    function setName(name) {
        if (name) {
            let regExp = name.match('"(.*)"');
            if (regExp && regExp.length > 1) {
                _name  = regExp[1].toString();
            }
        }
    }

    function setPath(path) {
        if (path) {
            let regExp = path.match("path = (.*)");
            if (regExp && regExp.length > 1) {
                _path = regExp[1].toString();
            }
        }
    }

    function setUrl(url) {
        if (url) {
            let regExp = url.match("url = (.*)");
            if (regExp && regExp.length > 1) {
                _url = regExp[1].toString();
            }
        }
    }

    function setRevisions() {
        let result = cp.execSync(`git diff HEAD^..HEAD ${_path}`);
        if (result) {
            const revisions = Array.from(result.toString().matchAll("[-|+]Subproject commit (.*)"));
            _prev_revision = revisions[0][1].toString();
            _revision = revisions[1][1].toString();
        }
    }

    function constructor(config) {
        if (config) {
            let lines = config.split('\n');
            if (lines.length > 2) {
                setName(lines[0]);
                setPath(lines[1]);
                setUrl(lines[2]);
                setRevisions();
            }
        }
    }

    _self.toString = function() {
        return `Name: ${_name} ` +
               `Path: ${_path} ` +
               `Url: ${_url}\n` +
               `Revision: ${_revision}\n` +
               `Old revision: ${_prev_revision}`;
    }

    _self.isChanged = function() {
        return _revision != _prev_revision; 
    }

    _self.getChanges = function() {
        let result = cp.execSync(`git -C ${_path} log ${_prev_revision}..${_revision} --format=%B`);
        let changes = [];
        
        if (result) {
            const lines = result.toString().split("\n");
            for(let i = 0; i < lines.length; ++i) {
                const change = new Change(lines[i], _name);
                if (change.isValid()) {
                    changes.push(change);
                }
            }
        }
        return changes;
    }

    constructor(config);
}

function Repo(path) {
    var _self = this;

    _self.getLatestCommit = function() {
        let result = cp.execSync(`git log --format=%B -n1`);
        return new Change(result.toString());
    }

    _self.getSubmodules = function() {
        let submodules = [];
        const stdout = fs.readFileSync('./.gitmodules', {encoding: 'utf8', flag: 'r'});
        
        if (stdout) {
            const configs = stdout.split('[submodule');
            for(let i = 0; i < configs.length; ++i) {
                if (configs[i]) {
                    submodules.push(new Submodule(configs[i]));
                }
            }
        }

        return submodules;
    }
}

function Change(comment, module) {
    var _self = this;
    var _type = null;
    var _module = module;
    var _message = "";
    var types = ['build', "ci", "docs", "feat", "fix", "perf", "refactor", "test"];

    _self.module = function() {
        if (_module) {
            return _module;
        }
        else {
            return "";
        }
    }

    _self.isValid = function() {
        return _type != null;
    }

    _self.type = function() {
        return _type;
    }

    _self.message = function() {
        return _message;
    }

    _self.toString = function() {
        return `- ${_message}`;
    }

    function setType(type) {
        if (types.includes(type)) {
            _type = type; 
        }
    }

    function parseType(comment) {
        let type = comment.match("(^.*):");
        if (type && type.length > 1) {
            setType(type[1]);
        }
    }

    function parseMessage(comment) {
        let message = comment.match(": (.*)");
        if (message && message.length > 1) {
            _message = message[1];
        }
    }

    function parseComment(comment){
        if (comment) {
            const lines = comment.split('\n');
            for(let i = 0; i < lines.length; ++i) {
                parseType(lines[i]);
                if (_self.isValid()) {
                    parseMessage(lines[i]);
                    break;
                }
            }
        }
    }

    parseComment(comment);
}

function ChangeLog() {
    var _self = this;
    var _changes = {};
    var _headers = {
        build: "Build system",
        ci: "Build system",
        docs: "Documentation",
        feat: "Enhancements",
        fix: "Bugs",
        perf: "Enhancements",
        refactor: "Enhancements",
        test: "Bugs"
    };

    function updateModules(modules, change) {
        const module = change.module();
        if (module in modules) {
            modules[module].push(change);
           
        }
        else {
            modules[module] = [change];
        }
    }

    _self.add = function(change) {
        if (change.isValid()) {
            const type = change.type();
            if (!(type in _changes)) {
                _changes[type] = [];
            }
            
            updateModules(_changes[type], change);
            
        }
    }

    function getHeader(key) {
        if (key in _headers) {
            return `\n${_headers[key]}:\n`;
        }
        else {
            return `\n${key}\n`;
        }
    }

    function getChanges(module) {
        let logs = "";
        for (let i = 0; i < module.length; ++i) {
            logs += module[i].toString();
            logs += "\n";
        }
        return logs;
    }

    function getModuleName(module) {
        if (module) {
            return `${module}\n`;
        }
        else {
            return "";
        }
    }

    function getModuleLogs(type) {
        let logs = "";
        for (let module in type) {
            logs += getModuleName(module);
            logs += getChanges(type[module]);
            logs += "\n";
        }
        return logs;
    }

    _self.build = function() {
        let changelog = "";
        for(let type in _changes) {
            changelog += getHeader(type);
            changelog += getModuleLogs(_changes[type]);
        }
        return changelog;
        
    }
}

function getSubmodulesChanges(submodules) {
    let changes = [];
    for (let i = 0; i < submodules.length; ++i) {
        if (submodules[i].isChanged()) {
            changes = changes.concat(submodules[i].getChanges());
        }
    }
    return changes;
}

function main() {
    try {
        const repo = new Repo();
        const changeLog = new ChangeLog();
        changeLog.add(repo.getLatestCommit());

        const submodules = getSubmodulesChanges(repo.getSubmodules());
        for (let i = 0; i < submodules.length; ++i) {
            changeLog.add(submodules[i]);
        }

        const result = changeLog.build();
        console.log(`INFO: Generated changelog \n ${result}`);
        core.setOutput('changelog', result);

    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
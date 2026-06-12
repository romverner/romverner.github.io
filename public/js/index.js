const ROMV = (() => {
    /**
     *  Hey there!
     */

    const _debug = false;

    const _createModule = (_name) => {
        const _errs = [];
        const _logs = [];
        const _identifier = `RV.${_name}`;

        const _recordErr = (_err) => {
            if (!_debug) return;

            const _errObj = _err instanceof Error
                ? { message: _err.message, stack: _err.stack, name: _err.name }
                : _err;

            _errObj.module = _identifier;
            _errObj.sessionTime = performance.now();
            console.log(_identifier, _errObj);
            _errs.push(_errObj);
        };

        const _recordLog = (_msg, _params = null) => {
            if (!_debug) return;
            
            _logs.push({
                module: _identifier,
                sessionTime: performance.now(),
                message: _msg,
                params: _params
            });

            console.log(_identifier, _msg, _params);
        };

        const _moduleInstance = {
            error: _recordErr,
            log: _recordLog,
            printErrors: () => console.table(_errs),
            printLogs: () => console.table(_logs),
        };

        ROMV[_name] = _moduleInstance;
        return _moduleInstance;
    };

    return {
        createModule(moduleName) {
            return _createModule(moduleName);
        },
    };
})();

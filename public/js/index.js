const RV = (() => {
    
    const _getContent = (callback) => {
        fetch('/public/json/contents.json')
        .then((response) => response.json())
        .then((data) => {
            callback(data);
        });
    };

    const _loadContent = (data) => {
        console.log(data);
    };
    
    return {
        loadContent() {
            _getContent(_loadContent);
        }
    };
})();
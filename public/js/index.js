const RV = (() => {

    const _loadContents = () => {
        fetch('/public/json/contents.json')
        .then(data => console.log(data))
        .catch(error => console.log(error));
    };

    return {
        loadContents() {
            _loadContents();
        }
    };
})();
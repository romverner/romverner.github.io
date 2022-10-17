import contentJson from './public/json/contents.json';

const RV = (() => {
    
    const _show = () => {
        console.log(contentJson);
    };
    
    return {
        show() {
            _show();
        }
    };
})();
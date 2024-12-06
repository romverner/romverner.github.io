const RV = (() => {

    let _filteredData = [];
    let _selectedCategory = '';
    let _data = [
        {
            "name": "Auto Zone",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "ACE Hardware",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Allegiant Air",
            "category": "airline",
            "affiliates": []
        },
        {
            "name": "Arby's",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "ArmorAll",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Ashley Furniture",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Bali Underwear",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Bausch + Lomb",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Big Heart Pet Brands",
            "category": "conglomerate",
            "affiliates": [
                "Gravy Train", 
                "Meow Mix", 
                "Milk-Bone", 
                "Milo's Kitchen",
                "Kibble's N Bits",
                "9Lives",
                "Natural Balance"
            ]
        },
        {
            "name": "Bike Athletics",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Molson Beer",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Coors Beer",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Brooks Shoes",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Buffalo Bills",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "Buffalo Wild Wings",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Buick Cadilac",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Carls Jr.",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Champ Clothing",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Hanes",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Cheverolet",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Cinnabon Cincinatti Financial",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Conair",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Cuisinart",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Dairy Queen",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Dirt Devil",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Discount Tire",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Dole Foods",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Exxon Dudley Sports",
            "category": "big oil",
            "affiliates": []
        },
        {
            "name": "Farberware",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Florist.com",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Folgers",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Fruit of the Loom",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Fruit Bouquets.com",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Frys Electronics",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Geico",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "George Forman Grill",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "GMC",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Hardee's",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Helzberg Diamonds",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Home Goods",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Hendrick Motorsports",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Hobby Lobby",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Hoover Vacuum",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Horizon Bank",
            "category": "bank",
            "affiliates": []
        },
        {
            "name": "Keller Williams Realty",
            "category": "realtor",
            "affiliates": []
        },
        {
            "name": "L'eggs Pantyhose",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Las Vegas Sands",
            "category": "casino",
            "affiliates": []
        },
        {
            "name": "L.L Bean",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Maidenform Underwear",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Marshalls",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Martins Famous Pastry Shoppes",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "McDonalds",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Miller Beer",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Milwaukee's Best Beer",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Molson",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Mobile",
            "category": "big oil",
            "affiliates": []
        },
        {
            "name": "My Pillow",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "NAPA Auto Parts",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "New Orlean Saints",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "NY Yankees",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "Norwegian Cruise",
            "category": "cruise line",
            "affiliates": []
        },
        {
            "name": "Old Dutch Foods",
            "category": "food",
            "affiliates": ["Humpty Dumpty Snack Foods"]
        },
        {
            "name": "Oreck Vacuums",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Purdue Farms",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Playtex",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Public Storage",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Rail Vac",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Schlotzsky's",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Shell Oil",
            "category": "big oil",
            "affiliates": []
        },
        {
            "name": "Sierra Trading Post",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Slumber Land",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Soma Intimates",
            "category": "clothing",
            "affiliates": []
        },
        {
            "name": "Spalding",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "Stanley Black and Decker Hardware",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Star Furniture",
            "category": "furniture",
            "affiliates": []
        },
        {
            "name": "Stiletto Tools",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Tampa Bay Buccaneers",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "The Popcorn Factory",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Toast Master",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Tractor Supply",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Wendy's",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Wynn Resorts",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "1800Flowers.com",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Smucker's Products",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Publix",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Act Floride",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Procter & Gamble",
            "category": "conglomerate",
            "affiliates": [
                "Always",
                "Ariel",
                "Bounty Paper Towels",
                "Charmin",
                "Crest Toothpaste",
                "Dawn",
                "Downy",
                "Fairy",
                "Febreeze",
                "Gain",
                "Gillette",
                "Head & Shoulders",
                "Olay",
                "Oral-B",
                "Pampers & Pampers Kandoo",
                "Pantene",
                "SK-II",
                "Tide",
                "Vicks"
            ]
        },
        {
            "name": "Baskin and Robins",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Charmin",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Omni Hotels",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Wow Cable",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Arizona Diamond Backs",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "Chiquita Brands",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Jimmy Deans",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Land o Lakes",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Boost Mobile",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Vanity Fair Paper Products",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "GNC",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Grey Goose",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Los Angeles Angels",
            "category": "sports",
            "affiliates": []
        },
        {
            "name": "Sonoco",
            "category": "big oil",
            "affiliates": []
        },
        {
            "name": "Tito's Vodka",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Turtle Wax",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Wonder Bread",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Urban Outfitters-Free People",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Enterprise Rental Car",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Motorola",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Papa Johns",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Walmart",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Young Brands",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Garmin Sports Products",
            "category": "brand",
            "affiliates": []
        },
        {
            "name": "Alamo Rental Cars",
            "category": "auto",
            "affiliates": []
        },
        {
            "name": "Hershey Products",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Anthropologie",
            "category": "retailer",
            "affiliates": []
        },
        {
            "name": "Bacardi",
            "category": "booze",
            "affiliates": []
        },
        {
            "name": "Blue Bell",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Chobani Yogurt",
            "category": "food",
            "affiliates": []
        },
        {
            "name": "Dean Foods",
            "category": "food",
            "affiliates": []
        }
    ];

    const _sort = () => {
        _data.sort((_a, _b) => {
            let _aText = _a.name.toUpperCase();
            let _bText = _b.name.toUpperCase();
            return (_aText < _bText) ? -1 : (_aText > _bText) ? 1 : 0;
        });
    };

    const _loadCategories = () => {
        let _categoryDivTag = document.getElementById('categories');
        let _uniqueCategories = [...new Set(_data.map(obj => obj.category))];

        _uniqueCategories.forEach((category, i) => {
            let _smallTag = document.createElement('small');
            _smallTag.innerText = `${category}`
            _smallTag.classList.add('pointer')
            _smallTag.setAttribute('onclick', `RV.filterByCategory("${category}")`);

            if (i !== 0 && i % 4 === 0) {
                _categoryDivTag.append(document.createElement('br'))
            }
            _categoryDivTag.append(_smallTag);
            
            if (i !== _uniqueCategories.length - 1) {
                let _separator = document.createElement('small');
                _separator.innerText = ' - '
                _categoryDivTag.append(_separator)
            }
        });
    }

    const _init = () => {
        _sort();
    };

    const _loadContent = (_content=null) => {
        let _companyDiv = document.getElementById('companies');
        _companyDiv.innerHTML = '';
        let _contentToLoad = (_content) ? _content : _data;
        _contentToLoad.forEach((_datum) => {
            let _hTag = document.createElement('h2');
            _hTag.innerText = _datum.name;
            let _smallTag = document.createElement('small');
            _smallTag.innerText = `Category: ${_datum.category}`;
            _companyDiv.append(_hTag);
            _companyDiv.append(_smallTag);
            
            if (_datum.affiliates.length > 0) {
                let _breakTag = document.createElement('br');
                _companyDiv.append(_breakTag)
                let _pTag = document.createElement('small');
                _pTag.innerText= `Affiliates: ${_datum.affiliates.join(', ')}`
                _companyDiv.append(_pTag)
            }
        });
    };

    const _search = () => {
        let _searchTag = document.getElementById('nameSearchInput');
        let _searchTerm = _searchTag.value.toLowerCase();

        var _searchResults = null;
        if (_filteredData.length > 0) {
            _searchResults = _filteredData.filter((_datum) => {
                return (_datum.name.toLowerCase().includes(_searchTerm));
            })    
        } else {
            _searchResults = _data.filter((_datum) => {
                return (_datum.name.toLowerCase().includes(_searchTerm));
            })
        }
        
        _filteredData = _searchResults
        _loadContent(_filteredData);
    };

    const _highlightSelectedCategory = () => {
        let _categoriesDiv = document.getElementById('categories');
        _categoriesDiv.childNodes.forEach((_childNode) => {
            if (_childNode.innerText == _selectedCategory) {
                if (_childNode.classList) {
                    _childNode.classList.add('bold');    
                }
            } else {
                if (_childNode.classList) {
                    _childNode.classList.remove('bold');    
                }
            };
        });
    };

    const _filterByCategory = (_category) => {
        _selectedCategory = _category;
        _highlightSelectedCategory();

        let _filteredResults = _data.filter((_datum) => {
            return (_datum.category === _category)
        })
        
        _filteredData = _filteredResults
        _loadContent(_filteredData);
    };

    const _reset = () => {
        _selectedCategory = '';
        _highlightSelectedCategory();
        _loadContent();
    };
    
    return {
        init() {
            _init();
        },
        filterByCategory(category) {
            _filterByCategory(category)
        },
        loadCategories() {
            _loadCategories();
        },
        loadContent() {
            _loadContent();
        },
        reset() {
            _reset();
        },
        search() {
            _search()
        }
    };
})();

RV.init();
RV.loadCategories();
RV.loadContent();
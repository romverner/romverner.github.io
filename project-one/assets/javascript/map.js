// Sets the maps default view to ADK Park
var mymap = L.map('mapid').setView([44.112734, -73.923726], 13);

var peaks = {
    0: {
        name: 'Mount Marcy',
        height: 5344,
        rank: 1,
        coordinates: [44.112734, -73.923726],
        url: "https://en.wikipedia.org/wiki/Mount_Marcy_(New_York)"
    },
    1: {
        name: 'Algonquin Peak',
        height: 5114,
        rank: 2,
        coordinates: [44.143611, -73.986667],
        url: "https://en.wikipedia.org/wiki/Algonquin_Peak"
    },
    2: {
        name: 'Mount Haystack',
        height: 4960,
        rank: 3,
        coordinates: [44.105556, -73.900556],
        url: "https://en.wikipedia.org/wiki/Mount_Haystack"
    },
    3: {
        name: 'Mount Skylight',
        height: 4920,
        rank: 4,
        coordinates: [44.099444, -73.930833],
        url: "https://en.wikipedia.org/wiki/Mount_Skylight"
    },
    4: {
        name: 'Whiteface Mountain',
        height: 4867,
        rank: 5,
        coordinates: [44.365833, -73.902778],
        url: "https://en.wikipedia.org/wiki/Whiteface_Mountain"
    },
    5: {
        name: 'Dix Mountain',
        height: 4857,
        rank: 6,
        coordinates: [44.082222, -73.786389],
        url: "https://en.wikipedia.org/wiki/Dix_Mountain"
    },
    6: {
        name: 'Gray Peak',
        height: 4840,
        rank: 7,
        coordinates: [44.111443, -73.934866],
        url: "https://en.wikipedia.org/wiki/Gray_Peak_(New_York)"
    },
    7: {
        name: 'Iroquois Peak',
        height: 4840,
        rank: 8,
        coordinates: [44.136997, -73.998203],
        url: "https://en.wikipedia.org/wiki/Iroquois_Peak"
    },
    8: {
        name: 'Basin Mountain',
        height: 4827,
        rank: 9,
        coordinates: [44.121164, -73.886253],
        url: "https://en.wikipedia.org/wiki/Basin_Mountain_(New_York)"
    },
    9: {
        name: 'Gothics',
        height: 4736,
        rank: 10,
        coordinates: [44.128108, -73.857085],
        url: "https://en.wikipedia.org/wiki/Gothics"
    },
    10: {
        name: 'Mount Colden',
        height: 4714,
        rank: 11,
        coordinates: [44.126998, -73.959867],
        url: "https://en.wikipedia.org/wiki/Mount_Colden"
    },
    11: {
        name: 'Giant Mountain',
        height: 4627,
        rank: 12,
        coordinates: [44.161143, -73.720209],
        url: "https://en.wikipedia.org/wiki/Giant_Mountain"
    },
    12: {
        name: 'Nippletop',
        height: 4620,
        rank: 13,
        coordinates: [44.089167, -73.816333],
        url: "https://en.wikipedia.org/wiki/Nippletop"
    },
    13: {
        name: 'Santanoni Peak',
        height: 4607,
        rank: 14,
        coordinates: [44.0825, -74.131167],
        url: "https://en.wikipedia.org/wiki/Santanoni_Peak"
    },
    14: {
        name: 'Mount Redfield',
        height: 4606,
        rank: 15,
        coordinates: [44.094777, -73.949866],
        url: "https://en.wikipedia.org/wiki/Mount_Redfield"
    },
    15: {
        name: 'Wright Peak',
        height: 4580,
        rank: 16,
        coordinates: [44.151667, -73.980278],
        url: "https://en.wikipedia.org/wiki/Wright_Peak"
    },
    16: {
        name: 'Saddleback Mountain',
        height: 4515,
        rank: 17,
        coordinates: [44.126667, -73.875167],
        url: "https://en.wikipedia.org/wiki/Saddleback_Mountain_(Keene,_New_York)"
    },
    17: {
        name: 'Panther Peak',
        height: 4442,
        rank: 18,
        coordinates: [44.098392, -74.132097],
        url: "https://en.wikipedia.org/wiki/Panther_Peak"
    },
    18: {
        name: 'Table Top Mountain',
        height: 4427,
        rank: 19,
        coordinates: [44.140667, -73.916333],
        url: "https://en.wikipedia.org/wiki/Table_Top_Mountain_(New_York)"
    },
    19: {
        name: 'Rocky Peak Ridge',
        height: 4420,
        rank: 20,
        coordinates: [44.154444, -73.705556],
        url: "https://en.wikipedia.org/wiki/Rocky_Peak_Ridge"
    },
    20: {
        name: 'Macomb Mountain',
        height: 4405,
        rank: 21,
        coordinates: [44.051721, -73.780135],
        url: "https://en.wikipedia.org/wiki/Macomb_Mountain"
    },
    21: {
        name: 'Armstrong Mountain',
        height: 4400,
        rank: 22,
        coordinates: [44.134774, -73.849029],
        url: "https://en.wikipedia.org/wiki/Armstrong_Mountain_(Keene_Valley,_New_York)"
    },
    22: {
        name: 'Hough Peak',
        height: 4400,
        rank: 23,
        coordinates: [44.069498, -73.777635],
        url: "https://en.wikipedia.org/wiki/Hough_Peak"
    },
    23: {
        name: 'Seward Mountain',
        height: 4361,
        rank: 24,
        coordinates: [44.159667, -74.199667],
        url: "https://en.wikipedia.org/wiki/Seward_Mountain_(New_York)"
    },
    24: {
        name: 'Mount Marshall',
        height: 4360,
        rank: 25,
        coordinates: [44.127554, -74.011814],
        url: "https://en.wikipedia.org/wiki/Mount_Marshall_(New_York)"
    },
    25: {
        name: 'Allen Mountain',
        height: 4340,
        rank: 26,
        coordinates: [44.070833, -73.939722],
        url: "https://en.wikipedia.org/wiki/Allen_Mountain_(New_York)"
    },
    26: {
        name: 'Big Slide Mountain',
        height: 4240,
        rank: 27,
        coordinates: [44.182272, -73.87042],
        url: "https://en.wikipedia.org/wiki/Big_Slide_Mountain_(New_York)"
    },
    27: {
        name: 'Esther Mountain',
        height: 4240,
        rank: 28,
        coordinates: [44.386992, -73.889867],
        url: "https://en.wikipedia.org/wiki/Esther_Mountain"
    },
    28: {
        name: 'Upper Wolfjaw Mountain',
        height: 4185,
        rank: 29,
        coordinates: [44.1405, -73.845333],
        url: "https://en.wikipedia.org/wiki/Upper_Wolfjaw_Mountain"
    },
    29: {
        name: 'Lower Wolfjaw Mountain',
        height: 4175,
        rank: 30,
        coordinates: [44.148385, -73.83264],
        url: "https://en.wikipedia.org/wiki/Lower_Wolfjaw_Mountain"
    },
    30: {
        name: 'Street Mountain',
        height: 4166,
        rank: 31,
        coordinates: [44.179333, -74.027167],
        url: "https://en.wikipedia.org/wiki/Street_Mountain_(New_York)"
    },
    31: {
        name: 'Phelps Mountain',
        height: 4161,
        rank: 32,
        coordinates: [44.157, -73.9215],
        url: "https://en.wikipedia.org/wiki/Phelps_Mountain_(New_York)"
    },
    32: {
        name: 'Donaldson Mountain',
        height: 4140,
        rank: 33,
        coordinates: [44.153947, -74.210991],
        url: "https://en.wikipedia.org/wiki/Donaldson_Mountain"
    },
    33: {
        name: 'Seymour Mountain',
        height: 4120,
        rank: 34,
        coordinates: [44.158167, -74.172667],
        url: "https://en.wikipedia.org/wiki/Seymour_Mountain_(Franklin_County,_New_York)"
    },
    34: {
        name: 'Sawteeth',
        height: 4100,
        rank: 35,
        coordinates: [44.113333, -73.850667],
        url: "https://en.wikipedia.org/wiki/Sawteeth_(New_York)"
    },
    35: {
        name: 'Cascade Mountain',
        height: 4098,
        rank: 36,
        coordinates: [44.218611, -73.860556],
        url: "https://en.wikipedia.org/wiki/Cascade_Mountain_(New_York)"
    },
    36: {
        name: 'South Dix',
        height: 4060,
        rank: 37,
        coordinates: [44.060054, -73.774301],
        url: "https://en.wikipedia.org/wiki/South_Dix"
    },
    37: {
        name: 'Porter Mountain',
        height: 4059,
        rank: 38,
        coordinates: [44.215278, -73.843611],
        url: "https://en.wikipedia.org/wiki/Porter_Mountain"
    },
    38: {
        name: 'Mount Colvin',
        height: 4057,
        rank: 39,
        coordinates: [44.093889, -73.834444],
        url: "https://en.wikipedia.org/wiki/Mount_Colvin"
    },
    39: {
        name: 'Mount Emmons',
        height: 4040,
        rank: 40,
        coordinates: [44.14367, -74.214046],
        url: "https://en.wikipedia.org/wiki/Mount_Emmons_(New_York)"
    },
    40: {
        name: 'Dial Mountain',
        height: 4020,
        rank: 41,
        coordinates: [44.105886, -73.79597],
        url: "https://en.wikipedia.org/wiki/Dial_Mountain"
    },
    41: {
        name: 'Grace Peak',
        height: 4012,
        rank: 42,
        coordinates: [44.065331, -73.757356],
        url: "https://en.wikipedia.org/wiki/Grace_Peak"
    },
    42: {
        name: 'Blake Peak',
        height: 3960,
        rank: 43,
        coordinates: [44.081443, -73.844583],
        url: "https://en.wikipedia.org/wiki/Blake_Peak"
    },
    43: {
        name: 'Cliff Mountain',
        height: 3960,
        rank: 44,
        coordinates: [44.10311, -73.975145],
        url: "https://en.wikipedia.org/wiki/Cliff_Mountain_(New_York)"
    },
    44: {
        name: 'Nye Mountain',
        height: 3895,
        rank: 45,
        coordinates: [44.18726, -74.02382],
        url: "https://en.wikipedia.org/wiki/Nye_Mountain"
    },
    45: {
        name: 'Couchsachraga Peak',
        height: 3820,
        rank: 46,
        coordinates: [44.095615, -74.160154],
        url: "https://en.wikipedia.org/wiki/Couchsachraga_Peak"
    }
};

$(document).ready(function() {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mymap);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox.streets',
        accessToken: 'pk.eyJ1Ijoicm9tdmVybmVyIiwiYSI6ImNqcTlweWNhbjNlaHE0M3VseXpmOTBwemwifQ.xhrx3dgm5fmjIPQYvIvEkQ'
    }).addTo(mymap);

    var drawMarker = function(coord, name, link, height) {
        L.marker(coord).addTo(mymap).bindPopup(
            "<a href=" + link + " target='_blank'>"
            + name + "</a>: "
            + height + " ft tall").openPopup();
    };

    // Drawing peak markers to the map with peak info in table
    Object.keys(peaks).forEach(function(key) {
        drawMarker(
            peaks[key].coordinates,
            peaks[key].name,
            peaks[key].url,
            peaks[key].height);

        var table = document.getElementById("mountain-table");
        var row = table.insertRow();
        var att = document.createAttribute("lat");
        var att2 = document.createAttribute("lng");
        var att3 = document.createAttribute("class");

        att.value  = peaks[key].coordinates[0];
        att2.value = peaks[key].coordinates[1];
        att3.value = "cell-two";

        var cell1 = row.insertCell(0);
        var cell2 = row.insertCell(1);
        var cell3 = row.insertCell(2);

        cell1.innerHTML = peaks[key].rank;
        cell2.innerHTML = peaks[key].name;
        cell2.setAttributeNode(att3);
        cell2.setAttributeNode(att2);
        cell2.setAttributeNode(att);
        cell3.innerHTML = peaks[key].height;
        
    });

});

$(document).on("click", ".cell-two", function(event) {
    event.preventDefault();

    var lat = this.getAttribute("lat");
    var lng = this.getAttribute("lng");


    mymap.panTo(new L.LatLng(lat, lng));
})
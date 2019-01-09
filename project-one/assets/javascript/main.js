// Global variables

var weatherURL = "https://cors-anywhere.herokuapp.com/https://api.darksky.net/forecast/303db51ff9b966556106c97e567c4dfe/44.1125,-73.923889";

var config = {
    apiKey: "AIzaSyCmqFvLXBLvmzLdfIiJpRVxdtNtR4LAlSU",
    authDomain: "journal-tracker.firebaseapp.com",
    databaseURL: "https://journal-tracker.firebaseio.com",
    projectId: "journal-tracker",
    storageBucket: "journal-tracker.appspot.com",
    messagingSenderId: "607808148"
};

firebase.initializeApp(config);

var database = firebase.database();

var username = {};
var postTitle = "";
var postDate = "";
var postDuration = "";
var postPeaks = "";
var postBody = "";

$(document).on("click", "#submit", function(event) {
    event.preventDefault();

    username = $("#usernameID").val().trim();
    postTitle = $("#titlePost").val().trim();
    postDate = $("#postDateComplete").val().trim();
    postDuration = $("#hikeDuration").val().trim();
    postPeaks = $("#peaksClimbed").val().trim();
    postBody = $("#hikeDescription").val().trim();

    var postInfo = {
        username: {
            'User Name': username, 
            'Title': postTitle,
            'Date Completed': postDate,
            'Hike Duration': postDuration,
            'Peaks Climbed': postPeaks,
            'Journal Entry': postBody
        }
    };

    database.ref().set({postInfo});
});

// Working with email.js to send emails from 46.peaks.expedition@gmail.com
// window.onload = function() {
//     document.getElementById('contact-form').addEventListener('submit', function(event) {
//         event.preventDefault();
//         emailjs.sendForm('gmail', 'hiking_template', this);
//     });
// };

// Working module
$.ajax({
    url: weatherURL,
    method: "GET"
    }).then(function(response) {

        /* To account for future API updates, checks for icon-value
           and sets default if not found. As recommended by Dark Sky. */
        var iconCheck = function(input) {
            var localArray = ['clear-day', 'clear-night', 'rain',
            'snow', 'sleet', 'wind', 'fog', 'cloudy',
            'partly-cloudy-day', 'partly-cloudy-night'];

            if (localArray.includes(input)) {
                return ("assets/images/weather/" + input.trim() + ".png")
            }
            else {
                return "assets/images/weather/default.png";
            };
        };

        var dateWrite = function(input) {
            var localDate = moment.unix(input).format("MM/DD");
            return localDate;
        };

        // If enough time, reduce repetetive code
        $("#icon1").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[0].icon)
            + " alt=" + response.daily.data[0].icon + ">");

        $("#day-one").text(dateWrite(response.daily.data[0].time)
            + ": " + response.daily.data[0].summary);

        $("#icon2").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[1].icon)
            + " alt=" + response.daily.data[1].icon + ">");

        $("#day-two").text(dateWrite(response.daily.data[1].time)
            + ": " + response.daily.data[1].summary);

        $("#icon3").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[2].icon)
            + " alt=" + response.daily.data[2].icon + ">");

        $("#day-three").text(dateWrite(response.daily.data[2].time)
            + ": " + response.daily.data[2].summary);

        $("#icon4").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[3].icon)
            + " alt=" + response.daily.data[3].icon + ">");

        $("#day-four").text(dateWrite(response.daily.data[3].time)
            + ": " + response.daily.data[3].summary);

        $("#icon5").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[4].icon)
            + " alt=" + response.daily.data[4].icon + ">");

        $("#day-five").text(dateWrite(response.daily.data[4].time)
            + ": " + response.daily.data[4].summary);

        $("#icon6").html("<img class='img-fluid' src="
            + iconCheck(response.daily.data[5].icon)
            + " alt=" + response.daily.data[5].icon + ">");

        $("#day-six").text(dateWrite(response.daily.data[5].time)
            + ": " + response.daily.data[5].summary);

        $("#weather-summary").text(response.daily.summary);
        console.log(response);
});

// Listener for checkbox
$(document).on("change", "input[id=emailCheck]", function() {
    if($(this).is(":checked")) {
        $('#myfieldset').prop('disabled', false);
        console.log("Hi!");
    }
    else {
        $('#myfieldset').prop('disabled', true);
    };
})
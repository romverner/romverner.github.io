// Global variables and initializing Firebase

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

var username = "";
var postTitle = "";
var postDate = "";
var postDuration = "";
var postPeaks = "";
var postBody = "";

// Listens and updates page according to any changes to Firebase
database.ref().on("child_added", function(snapshot) {
    var sv = snapshot.val();

    renderGuestbook(snapshot);

}, function(errorObject) {
    console.log("Errors handled: " + errorObject.code);
});

// Working with email.js to send emails from 46.peaks.expedition@gmail.com & update/send to Firebase
window.onload = function() {
    document.getElementById('contact-form').addEventListener('submit', function(event) {
        event.preventDefault();

        if($("input[id=emailCheck]").is(":checked")) {
            emailjs.sendForm('gmail', 'hiking_template', this);
        };

        username = $("#usernameID").val().trim();
        postTitle = $("#titlePost").val().trim();
        postDate = $("#postDateComplete").val().trim();
        postDuration = $("#hikeDuration").val().trim();
        postPeaks = $("#peaksClimbed").val().trim();
        postBody = $("#hikeDescription").val().trim();

        var post = {
            username: username, 
            postTitle: postTitle,
            postDate: postDate,
            postDuration: postDuration,
            postPeaks: postPeaks,
            postBody: postBody
        };

        database.ref().push({post});
    });
};

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
    }
    else {
        $('#myfieldset').prop('disabled', true);
    };
})

// Pulls entries from Firebase and renders to screen
var renderGuestbook = function(s) {
    var entryDiv = $("<div>");
    var nameDiv  = $("<div>");
    var peakDiv  = $("<div>");
    var timeDiv  = $("<div>");
    var dateDiv  = $("<div>");
    var bodyDiv  = $("<div>");

    entryDiv.attr("class", "ml-5 mt-5 mr-5");

    nameDiv.attr("class", "col-sm-12");
    nameDiv.html("<h4>Name: " + s.val().post.username + "</h4>");

    peakDiv.attr("class", "col-sm-12");
    peakDiv.html("<h6>Climbed: " + s.val().post.postPeaks + "</h6>")

    timeDiv.attr("class", "col-sm-12");
    timeDiv.html("<h6>Time Taken: " + s.val().post.postDuration + "</h6>");

    dateDiv.attr("class", "col-sm-12");
    dateDiv.html("<h6>Date: " + s.val().post.postDate + "</h6>");

    bodyDiv.attr("class", "col-sm-12 mt-3");
    bodyDiv.html(
        "<p><b>" + s.val().post.postTitle + "</b><br>"
        + s.val().post.postBody + "</p>"
    );

    entryDiv.append(nameDiv, peakDiv, timeDiv, dateDiv, bodyDiv);
    $("#guestEntry").prepend(entryDiv);
};
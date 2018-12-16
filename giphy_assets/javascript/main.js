// _________NOTES_________
// Things to Add:
// Clear text input field upon entry

// Array of video game titles to be queried in GIPHY API
var topics = ["Super Mario Odyssey", "Animal Crossing New Leaf", "Skyrim", "Mirrors Edge", "Call of Duty 4", "Destiny 2"];
var gifAmount = 10;

// Waits for HTML to load before running script
$(document).ready(function () {
    
    // Initial render of buttons
    renderButtons();

    $(document).on("click", ".gif-button", function () {
        event.preventDefault();

        var queryURL = "https://api.giphy.com/v1/gifs/search?q=";
        queryURL += $(this).attr('data').trim().replace(/ /g,"_");
        queryURL += "&api_key=IkkWjxhZzjCB0hbJgT2DD9h3atLYPtKP";
        queryURL += "&limit=" + gifAmount;
        console.log(queryURL);

        $.ajax({
            url: queryURL,
            method: "GET"
            }).then(function(response) {
                $("#gifs").empty();
                console.log(response);

                for (i = 0; i < gifAmount; i++) {
                    var newDiv = $("<div>");
                    newDiv.addClass("mt-1 mb-1");

                    var newIMG = $("<img>");
                    newIMG.addClass("status rounded");
                    newIMG.attr("src", response.data[i].images.fixed_height_still.url);
                    newIMG.attr("data-still", response.data[i].images.fixed_height_still.url);
                    newIMG.attr("data-active", response.data[i].images.fixed_height.url)
                    newIMG.attr("data-search", topics[i]);
                    newIMG.attr("data-status", "still");
                    newIMG.attr("value", i);

                    newDiv.append("<h4>Rating: " + response.data[i].rating.toUpperCase() + "</h4>");
                    newDiv.append(newIMG);

                    $("#gifs").prepend(newDiv);
                };
            });
    });

    // Event listener for image clicks, plays or pauses GIF depending on current state
    $(document).on("click", "img", function() {
        event.preventDefault();

        var stillImage = $(this).attr('data-still');
        var activeImage = $(this).attr('data-active');

        var state = $(this).attr('data-status');
        if (state === 'still') {
            $(this).attr('src', activeImage);
            $(this).attr('data-status', 'active');
        }
        else if (state === 'active') {
            $(this).attr('src', stillImage);
            $(this).attr('data-status', 'still');
        };
    });

    // Event listener for user text-field inputs
    $(document).on("click", "#add-button", function() {
        event.preventDefault();

        var input = $("#button-input").val().trim();
        topics.push(input);
        renderButtons();
    });
});

// Function that renders buttons onto screen
function renderButtons() {
    $(".buttonsHere").empty();
    
    for (i = 0; i < topics.length; i++) {

        var b = $("<button>");
        b.text(topics[i]);
        b.addClass("btn btn-secondary gif-button mt-2 mb-2 mr-1 ml-1");
        b.attr('data', topics[i]);
        b.attr('value', i);
        $(".buttonsHere").append(b);

        console.log("Added buttons!");
    };
};
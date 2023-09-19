const path = require("path");
const fs = require("fs");

// Specify the path to the JSON file
const genresFilePath = path.join(__dirname, "genres.json");

// Load the JSON file
let playlists = {};

try {
  const data = fs.readFileSync(genresFilePath, "utf-8");
  playlists = JSON.parse(data);
} catch (error) {
  console.error("Error loading genres JSON file:", error);
}


const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Spotify API credentials
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyApiEndpoint = "https://api.spotify.com/v1"

// Retrieve playlist URIs from environment variables
const dancePlaylistUri = process.env.SPOTIFY_DANCE_PLAYLIST_URI;
const folkPlaylistUri = process.env.SPOTIFY_FOLK_PLAYLIST_URI;

// Create an object to store the cached playlist data
const cache = {};


// App

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Define a route to check if a song is in a playlist
app.get("/checkSong", async (req, res) => {
  const playlistId = req.query.playlistId;
  const trackId = req.query.trackId;

  console.log(playlistId + " " + trackId);

  try {
    const accessToken = await authenticate();
    console.log("Access token acquired");
    const isSongPresent = await isSongInPlaylist(accessToken, playlistId, trackId);

    if (isSongPresent) {
      res.status(200).send();
      console.log("Found");
    } else {
      res.status(202).send();
      console.log("Not found");
    }
  } catch (error) {
    res.status(500).send("Error occurred: " + JSON.stringify(error.response.data));
    console.log(JSON.stringify(error.response.data));
  }
});

// Define a route to sort and check a track
app.get("/sort-and-check-track", async (req, res) => {
    try {
      const trackId = req.query.trackId;
      if (!trackId) {
        return res.status(400).json({ error: "Missing trackId in request body" });
      }
  
      // Fetch track details from Spotify API
      const trackDetails = await fetchTrackDetails(trackId);
  
      if (!trackDetails) {
        return res.status(404).json({ error: "Track not found on Spotify" });
      }
  
      // Determine which playlist(s) the track belongs to
      const matchingPlaylists = determineMatchingPlaylists(trackDetails.genres,playlists);
  
      console.log(matchingPlaylists);

      const playlistChecks = [];
  
      // Check if the song is in the specified playlists for which there is a genre match
      if (matchingPlaylists.includes("dance")) {
        playlistChecks.push(isSongInPlaylist(trackId, dancePlaylistUri));
      }
  
      if (matchingPlaylists.includes("folk")) {
        playlistChecks.push(isSongInPlaylist(trackId, folkPlaylistUri));
      }
  
      // Wait for all playlist checks to complete
      const [isSongPresentInDancePlaylist, isSongPresentInFolkPlaylist] = await Promise.all(
        playlistChecks
      );
  
    // Determine the status code based on the criteria
    let statusCode;

    if (isSongPresentInDancePlaylist && isSongPresentInFolkPlaylist) {
      statusCode = 200; // Both playlists
    } else if (isSongPresentInDancePlaylist) {
      statusCode = 201; // Dance playlist
    } else if (isSongPresentInFolkPlaylist) {
      statusCode = 202; // Folk playlist
    } else {
      statusCode = 204; // Neither playlist
    }

    res.status(statusCode).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
  });
  

// Functions

// Playlist check functions

// Check if the song is in the playlist

async function isSongInPlaylist(accessToken, playlistId, trackId) {
    // Fetch the playlist data
    const playlistData = await fetchPlaylistData(accessToken, playlistId);
    console.log("Playlist data acquired");
  
    // Check if the track exists in the playlist
    const matchingSong = playlistData.find((item) => item.track.id === trackId);
    const foundMatch = !!matchingSong;
  
    if (foundMatch) {
      // console.log('Found');
    } else {
      // console.log('Not found');
    }
  
    return foundMatch; // Return the flag variable
  }
  
  // Function to fetch the playlist data from Spotify or cache
  async function fetchPlaylistData(accessToken, playlistId) {
    const cacheTimeout = process.env.CACHETIMEOUT * 1000; // Timeout in seconds (adjust as needed)
  
    // Check if cache for the playlist exists and is valid
  
    if(cache[playlistId]) {
      console.log("cache exists. Timestamp now: " + Date.now() + ". Cache timestamp: " + cache[playlistId].timestamp + ". Cache timeout: " + cacheTimeout);
      let cacheAge = Date.now() - cache[playlistId].timestamp;
      if (cacheAge < cacheTimeout) {
        console.log("Cache is valid");
        return cache[playlistId].data;
      }
  
    }
  
    console.log("Not found in cache; pinging Spotify");
  
    // Fetch the total number of items in the playlist
    const totalResponse = await axios({
      method: 'GET',
      url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        offset: 0,
        limit: 1,
      },
    });
  
    const totalItems = totalResponse.data.total;
    console.log("Total items: " + totalItems);
  
    const batchSize = 100;
    const batchCount = Math.ceil(totalItems / batchSize);
  
    // Create an array of promises for each batch
    const batchPromises = Array.from({ length: batchCount }, (_, index) =>
      axios({
        method: 'GET',
        url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          offset: (batchCount - index - 1) * batchSize,
          limit: batchSize,
        },
      })
    );
  
    // Execute the promises concurrently using Promise.all
    const batchResponses = await Promise.all(batchPromises);
    console.log("All promises complete");
  
    // Concatenate the batch responses into a single array of tracks
    const tracks = batchResponses.reduce((acc, response) => {
      return acc.concat(response.data.items);
    }, []);
  
    // Update the cache for the playlist with the new data and timestamp
    cache[playlistId] = {
      data: tracks,
      timestamp: Date.now(), // Store the current time in milliseconds
    };
  
    return tracks;
  }
  
  
  // Authenticate and get an access token
  async function authenticate() {
    const authResponse = await axios({
      method: 'POST',
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      data: 'grant_type=client_credentials',
    });
    // console.log(authResponse.data.access_token)
    return authResponse.data.access_token;
    
  }
  
  // Sorter functions

// Fetch track details from Spotify API
async function fetchTrackDetails(trackId) {
  try {
    // Obtain a Spotify access token using client credentials flow
    const accessToken = await authenticate();

    // Make an authenticated request to Spotify API to get track details
    const response = await axios.get(`${spotifyApiEndpoint}/tracks/${trackId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 200) {
      // Retrieve album details for the track
      const albumId = response.data.album.id;
      const albumResponse = await axios.get(`${spotifyApiEndpoint}/albums/${albumId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Retrieve artist details for the track
      const artistIds = response.data.artists.map((artist) => artist.id);
      const artistResponses = await Promise.all(
        artistIds.map((artistId) =>
          axios.get(`${spotifyApiEndpoint}/artists/${artistId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
        )
      );

      // Extract genres from the album and artist(s) and flatten them into one array
      const albumGenres = albumResponse.data.genres;
      const artistGenres = artistResponses.flatMap((artistResponse) => artistResponse.data.genres);

      // Combine album and artist genres
      const combinedGenres = [...albumGenres, ...artistGenres];

      console.log(combinedGenres);

      return {
        name: response.data.name,
        genres: combinedGenres,
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching track details:", error);
    return null;
  }
}

  
  
// Determine which playlist(s) the track belongs to based on keyword search
function determineMatchingPlaylists(trackGenres, genresData) {
  const matchingPlaylists = [];

  for (const playlist in playlists) {
    const playlistGenres = playlists[playlist];
    const hasMatchingGenre = trackGenres.some((trackGenre) =>
      playlistGenres.some((playlistGenre) =>
        genresData[trackGenre.toLowerCase()] &&
        genresData[trackGenre.toLowerCase()].some(keyword =>
          playlistGenre.toLowerCase().includes(keyword.toLowerCase())
        )
      )
    );

    if (hasMatchingGenre) {
      matchingPlaylists.push(playlist);
      // Break the loop when the first match is found
      break;
    }
  }

  return matchingPlaylists;
}

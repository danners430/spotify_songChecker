const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Spotify API credentials
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

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
  return authResponse.data.access_token;
}

// Get the album id
/*
async function getAlbumId(accessToken, trackId) {
  const response = await axios({
    method: 'GET',
    url: `https://api.spotify.com/v1/tracks/${trackId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  const trackData = response.data;
  const albumId = trackData.album.id;

  return albumId;
}
*/

// Check if the song is in the playlist

async function isSongInPlaylist(accessToken, playlistId, trackId) {
  let totalItems = 0;
  let foundMatch = false; // Flag variable to track match status

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

  totalItems = totalResponse.data.total;
  console.log(totalItems);

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

  // Iterate through the responses and check for a matching song in parallel
  const matchPromises = batchResponses.map(async (response, index) => {
    const playlistItems = response.data.items;
    console.log(`Processing batch ${index + 1}/${batchCount}`);
    const matchingSong = playlistItems.find((item) => item.track.id === trackId);
    if (matchingSong) {
      console.log('Found');
      foundMatch = true;
    }
  });

  // Wait for all match-checking promises to complete
  await Promise.all(matchPromises);

  return foundMatch; // Return the flag variable
}

// HTTP route to check if a song is in a playlist
app.get('/checkSong', async (req, res) => {
  const playlistId = req.query.playlistId;
  const trackId = req.query.trackId;

  console.log(playlistId + " " + trackId);

  try {
    const accessToken = await authenticate();
    // const albumId = await getAlbumId(accessToken,trackId);
    const isSongPresent = await isSongInPlaylist(accessToken, playlistId, trackId);

    if (isSongPresent) {
      res.status(200).send();
      console.log("Found");
    } else {
      res.status(404).send();
      console.log("Not found");
    }
  } catch (error) {
    res.status(500).send('Error occurred: ' + JSON.stringify(error.response.data));
    console.log(JSON.stringify(error.response.data));
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

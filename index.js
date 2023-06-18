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

// Check if the song is in the playlist
async function isSongInPlaylist(accessToken, playlistId, songUri) {
  const playlistResponse = await axios({
    method: 'GET',
    url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const playlistItems = playlistResponse.data.items;
  const matchingSong = playlistItems.find((item) => item.track.uri === songUri);

  return matchingSong !== undefined;
}

// HTTP route to check if a song is in a playlist
app.get('/checkSong', async (req, res) => {
  const playlistId = req.query.playlistId;
  const songUri = req.query.songUri;

  try {
    const accessToken = await authenticate();
    const isSongPresent = await isSongInPlaylist(accessToken, playlistId, songUri);

    if (isSongPresent) {
      res.send('The song is already in the specified playlist.');
    } else {
      res.send('The song is not in the specified playlist.');
    }
  } catch (error) {
    res.status(500).send('Error occurred:', error.response.data);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

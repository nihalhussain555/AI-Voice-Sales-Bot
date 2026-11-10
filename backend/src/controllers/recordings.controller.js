// Browser microphone recordings. The URL is stored relative (/recordings/…) so
// it stays valid whichever host serves the file; the SPA prefixes the API base.
export function uploadRecording(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  res.json({ url: `/recordings/${req.file.filename}` });
}

import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, LocateFixed, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 4 * 1024 * 1024;

export function CitizenReportPage() {
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [contactReference, setContactReference] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!status?.eventId || ['PROCESSED', 'FAILED', 'IGNORED'].includes(status.status)) return undefined;
    const timer = setInterval(async () => {
      try { setStatus(await api(`/events/${status.eventId}/status`)); } catch { /* keep last known receipt */ }
    }, 2_000);
    return () => clearInterval(timer);
  }, [status]);

  function chooseImage(file) {
    if (!file) { setImage(null); setPreview(null); return; }
    if (!allowedTypes.has(file.type) || file.size > maxBytes) {
      setError('Choose a JPEG, PNG, or WEBP image no larger than 4 MB.'); return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setImage(file); setPreview(URL.createObjectURL(file)); setError(null);
  }

  function locate() {
    if (!navigator.geolocation) { setError('Browser location is unavailable. Enter coordinates manually.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLatitude(coords.latitude.toFixed(6)); setLongitude(coords.longitude.toFixed(6)); setError(null); },
      () => setError('Location permission was not granted. You can enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null); setStatus(null);
    const form = new FormData();
    form.append('description', description);
    if (latitude && longitude) { form.append('latitude', latitude); form.append('longitude', longitude); }
    if (contactReference) form.append('contactReference', contactReference);
    if (image) form.append('image', image);
    try { setStatus(await api('/events/citizen-report', { method: 'POST', body: form })); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="report-page">
      <header className="report-header"><a href="/"><ArrowLeft size={17} /> Command Center</a><span><ShieldCheck size={21} /><strong>ResQai Citizen Report</strong></span></header>
      <div className="report-layout"><section className="report-intro"><span className="report-icon"><TriangleAlert size={30} /></span><h1>Report an emergency</h1><p>Share what you can observe. Do not enter a dangerous area to collect details or take a photo.</p><small>Reports are processed as evidence. Emergency operators make all response decisions.</small></section>
      <form className="report-form" onSubmit={submit}>
        <label>Description<textarea required minLength={5} maxLength={2000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what you can see or hear…" /></label>
        <fieldset><legend>Location (optional)</legend><button type="button" onClick={locate}><LocateFixed size={15} /> Use my location</button><div><label>Latitude<input type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div></fieldset>
        <label>Image (optional)<span className="image-picker"><Camera size={18} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files[0])} />JPEG, PNG, or WEBP · max 4 MB</span></label>
        {preview && <img className="report-preview" src={preview} alt="Selected emergency evidence preview" />}
        <label>Contact/reference (optional)<input maxLength={128} value={contactReference} onChange={(event) => setContactReference(event.target.value)} placeholder="Reference only; avoid sensitive personal details" /></label>
        {error && <p className="report-error"><TriangleAlert size={15} /> {error}</p>}
        <button className="report-submit" type="submit" disabled={busy || description.trim().length < 5}><Send size={16} /> {busy ? 'Submitting…' : 'Submit report'}</button>
        {status && <div className="report-status"><CheckCircle2 size={24} /><div><strong>Report received</strong><p>Event ID: {status.eventId}</p><p>Status: {status.status?.replaceAll('_', ' ')}</p>{status.incident && <a href={`/?incident=${encodeURIComponent(status.incident.incidentId)}`}>Track {status.incident.incidentId} in Command Center</a>}</div></div>}
      </form></div>
    </main>
  );
}

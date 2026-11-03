import { describe, expect, it } from 'vitest';

import { GpxInvalideError, parserGpx } from './gpx';

function trkpt(lat: number, lon: number, ele?: number, temps?: string): string {
  const morceaux = [`<trkpt lat="${lat}" lon="${lon}">`];
  if (ele !== undefined) {
    morceaux.push(`<ele>${ele}</ele>`);
  }
  if (temps !== undefined) {
    morceaux.push(`<time>${temps}</time>`);
  }
  morceaux.push('</trkpt>');
  return morceaux.join('');
}

function gpxMinimal(points: string, options: { nom?: string; dateMeta?: string } = {}): string {
  const meta =
    options.dateMeta !== undefined
      ? `<metadata><time>${options.dateMeta}</time></metadata>`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" version="1.1">
  ${meta}
  <trk><name>${options.nom ?? 'Fixture'}</name><trkseg>${points}</trkseg></trk>
</gpx>`;
}

describe('parcours — parseur GPX', () => {
  it('parse nom, date de métadonnées et points (lon/lat/ele/time)', () => {
    const xml = gpxMinimal(
      trkpt(36.5, 4.25, 678.2, '2026-01-01T08:00:00.000Z') + trkpt(36.51, 4.26, 690, '2026-01-01T08:00:01.000Z'),
      { nom: 'essai fixture', dateMeta: '2026-01-01T07:59:00.000Z' },
    );
    const releve = parserGpx(xml);
    expect(releve.nom).toBe('essai fixture');
    expect(releve.dateReleveIso).toBe('2026-01-01T07:59:00.000Z');
    expect(releve.points).toHaveLength(2);
    expect(releve.points[0]).toMatchObject({
      lon: 4.25,
      lat: 36.5,
      ele: 678.2,
      tempsIso: '2026-01-01T08:00:00.000Z',
      tempsMs: Date.parse('2026-01-01T08:00:00.000Z'),
    });
    expect(releve.points[1]?.ele).toBe(690);
  });

  it('sans <metadata><time>, la date du relevé tombe sur le premier point', () => {
    const releve = parserGpx(gpxMinimal(trkpt(10, 20, 30, '2026-02-03T09:00:00.000Z')));
    expect(releve.dateReleveIso).toBe('2026-02-03T09:00:00.000Z');
  });

  it('point sans <ele> ⇒ erreur nommée qui compte les points incomplets', () => {
    const xml = gpxMinimal(
      trkpt(0, 0, 100, '2026-01-01T08:00:00.000Z') +
        trkpt(0.001, 0, undefined, '2026-01-01T08:00:01.000Z') +
        trkpt(0.002, 0, 101, '2026-01-01T08:00:02.000Z'),
    );
    expect(() => parserGpx(xml)).toThrow(GpxInvalideError);
    expect(() => parserGpx(xml)).toThrow(/1 point\(s\) sans <ele>/);
  });

  it('point sans <time> ⇒ erreur nommée (la porte mesure des pas de temps)', () => {
    const xml = gpxMinimal(
      trkpt(0, 0, 100, '2026-01-01T08:00:00.000Z') + trkpt(0.001, 0, 101, undefined),
    );
    expect(() => parserGpx(xml)).toThrow(/1 point\(s\) sans <time>/);
  });

  it('aucun trkpt ⇒ erreur nommée « aucun point »', () => {
    expect(() => parserGpx(gpxMinimal(''))).toThrow(/aucun point de trace/);
  });

  it('ignore les extensions Garmin entre <ele> et <time>', () => {
    const xml = `<?xml version="1.0"?>
<gpx><trk><name>Avec extensions</name><trkseg>
<trkpt lat="1" lon="2"><ele>500</ele><time>2026-01-01T08:00:00.000Z</time>
<extensions><ns3:TrackPointExtension><ns3:hr>84</ns3:hr></ns3:TrackPointExtension></extensions>
</trkpt>
</trkseg></trk></gpx>`;
    const releve = parserGpx(xml);
    expect(releve.points).toHaveLength(1);
    expect(releve.points[0]?.ele).toBe(500);
    expect(releve.points[0]?.tempsMs).toBe(Date.parse('2026-01-01T08:00:00.000Z'));
  });
});

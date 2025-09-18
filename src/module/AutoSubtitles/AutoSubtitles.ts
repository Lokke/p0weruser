import { ModuleSetting, PoweruserModule, StreamItem } from "@/types";
import Utils, { loadStyle } from "@/Utils";
import style from "./autoSubtitles.less?inline";

export default class AutoSubtitles implements PoweruserModule {
    readonly id = 'AutoSubtitles';
    readonly name = 'Auto Subtitles';
    readonly description = 'Erkennt automatisch Untertitel für Videos und zeigt den CC-Button an.';
    readonly isEnabled = true; // Could be made configurable via settings

    async load() {
        this.initAutoSubtitles();
        loadStyle(style);
    }

    /**
     * Extrahiert die Video-URL aus einem StreamItem und generiert die entsprechende VTT-URL
     */
    private generateSubtitleUrl(videoUrl: string): string | null {
        // Beispiel: https://videos.pr0gramm.com/2025/09/16/43405b442ccd5086.mp4
        // wird zu: https://images.pr0gramm.com/2025/09/16/43405b442ccd5086-de.vtt
        
        const videoUrlPattern = /^https?:\/\/videos\.pr0gramm\.com\/(.+)\.mp4$/;
        const match = videoUrl.match(videoUrlPattern);
        
        if (match) {
            const pathWithoutExtension = match[1];
            return `https://images.pr0gramm.com/${pathWithoutExtension}-de.vtt`;
        }
        
        return null;
    }

    /**
     * Prüft ob eine VTT-Datei verfügbar ist
     */
    private async checkSubtitleAvailable(vttUrl: string): Promise<boolean> {
        try {
            const response = await fetch(vttUrl, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            console.debug('AutoSubtitles: VTT file not available:', vttUrl);
            return false;
        }
    }

    /**
     * Fügt Untertitel-Informationen zu einem StreamItem hinzu
     */
    private async enhanceItemWithSubtitles(itemData: StreamItem): Promise<void> {
        // Nur für Videos relevant
        if (!itemData.image || !itemData.image.includes('.mp4')) {
            return;
        }

        // Bereits Untertitel vorhanden? Dann nichts tun
        if ((itemData as any).subtitles && (itemData as any).subtitles.length > 0) {
            return;
        }

        const videoUrl = itemData.image.startsWith('//') ? `https:${itemData.image}` : itemData.image;
        const vttUrl = this.generateSubtitleUrl(videoUrl);
        
        if (!vttUrl) {
            return;
        }

        const isAvailable = await this.checkSubtitleAvailable(vttUrl);
        
        if (isAvailable) {
            // Füge Untertitel-Information zum Item hinzu
            (itemData as any).subtitles = [{
                path: vttUrl,
                label: 'Deutsch',
                language: 'de',
                isDefault: true
            }];
            
            console.debug('AutoSubtitles: Added subtitle for video:', videoUrl, '-> VTT:', vttUrl);
        }
    }

    /**
     * Initialisiert die automatische Untertitel-Erkennung
     */
    private initAutoSubtitles() {
        const _this = this;

        // Nutze das itemOpened Event anstatt die View zu überschreiben
        window.addEventListener('itemOpened', async (ev: Event & any) => {
            const itemData = ev.data.itemData;
            
            // Zuerst prüfen ob Untertitel verfügbar sind
            await _this.enhanceItemWithSubtitles(itemData);
            
            // Wenn Untertitel hinzugefügt wurden, das Video neu rendern
            if ((itemData as any).subtitles && (itemData as any).subtitles.length > 0) {
                // Kurz warten bis das DOM bereit ist
                setTimeout(() => {
                    _this.activateSubtitleControls();
                    _this.updateVideoWithSubtitles(itemData, ev.data.$container);
                }, 100);
            }
        });
    }

    /**
     * Aktualisiert das Video-Element mit den neuen Untertiteln
     */
    private updateVideoWithSubtitles(itemData: StreamItem, $container: any) {
        const videoElement = $container.find('.item-image-actual')[0] as HTMLVideoElement;
        
        if (!videoElement || !videoElement.tagName || videoElement.tagName !== 'VIDEO') {
            return;
        }

        const subtitles = (itemData as any).subtitles;
        if (!subtitles || subtitles.length === 0) {
            return;
        }

        // Entferne bereits vorhandene Track-Elemente
        const existingTracks = videoElement.querySelectorAll('track');
        existingTracks.forEach(track => track.remove());

        // Füge neue Track-Elemente hinzu
        subtitles.forEach((subtitle: any) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.src = subtitle.path;
            track.label = subtitle.label;
            track.srclang = subtitle.language;
            
            if (subtitle.isDefault || subtitles.length === 1) {
                track.setAttribute('data-is-default', '');
            }
            
            videoElement.appendChild(track);
        });

        console.debug('AutoSubtitles: Updated video with subtitle tracks:', subtitles);
    }

    /**
     * Aktiviert die Untertitel-Controls nach dem Rendern
     */
    private activateSubtitleControls() {
        // Mehrere Versuche, da das DOM noch nicht bereit sein könnte
        let attempts = 0;
        const maxAttempts = 10;
        
        const tryActivate = () => {
            const subtitleCheckbox = document.getElementById('video-controls-enable-subtitles-checkbox') as HTMLInputElement;
            const videoElement = document.querySelector('.item-image-actual') as HTMLVideoElement;
            
            if (!subtitleCheckbox || !videoElement || attempts >= maxAttempts) {
                if (attempts >= maxAttempts) {
                    console.debug('AutoSubtitles: Could not find subtitle controls after', maxAttempts, 'attempts');
                }
                return;
            }

            // Event-Listener für CC-Button (nur einmal hinzufügen)
            if (!subtitleCheckbox.hasAttribute('data-autosubtitles-attached')) {
                subtitleCheckbox.setAttribute('data-autosubtitles-attached', 'true');
                
                subtitleCheckbox.addEventListener('change', () => {
                    const tracks = videoElement.querySelectorAll('track');
                    
                    tracks.forEach(track => {
                        const htmlTrack = track as HTMLTrackElement;
                        if (htmlTrack.track) {
                            htmlTrack.track.mode = subtitleCheckbox.checked ? 'showing' : 'hidden';
                        }
                    });
                    
                    console.debug('AutoSubtitles: Subtitles', subtitleCheckbox.checked ? 'enabled' : 'disabled');
                });
            }

            // Automatisch Untertitel einschalten wenn verfügbar und Standard
            const defaultTrack = videoElement.querySelector('track[data-is-default]') as HTMLTrackElement;
            if (defaultTrack && defaultTrack.track) {
                // Kurz warten bis das Video geladen ist
                setTimeout(() => {
                    if (defaultTrack.track && defaultTrack.track.mode !== 'showing') {
                        subtitleCheckbox.checked = true;
                        defaultTrack.track.mode = 'showing';
                        console.debug('AutoSubtitles: Auto-enabled default subtitles');
                    }
                }, 500);
            }
        };
        
        // Versuche es sofort und dann mit Verzögerungen
        tryActivate();
        attempts++;
        
        const retryInterval = setInterval(() => {
            attempts++;
            tryActivate();
            
            if (attempts >= maxAttempts || document.getElementById('video-controls-enable-subtitles-checkbox')) {
                clearInterval(retryInterval);
            }
        }, 100);
    }

    getSettings(): ModuleSetting[] {
        return [
            {
                id: 'auto_enable',
                title: 'Automatisch aktivieren',
                description: 'Aktiviere Untertitel automatisch wenn verfügbar.',
                type: "checkbox"
            }
        ];
    }
}
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

        // Erweitere die Stream Item View um automatische Untertitel-Erkennung
        p.View.Stream.Item = p.View.Stream.Item.extend({
            show: async function (
                rowIndex: any,
                itemData: StreamItem,
                defaultHeight: any,
                jumpToComment: any
            ) {
                // Zuerst prüfen ob Untertitel verfügbar sind
                await _this.enhanceItemWithSubtitles(itemData);
                
                // Dann das normale Verhalten ausführen
                this.parent(rowIndex, itemData, defaultHeight, jumpToComment);
                
                // Nach dem Rendern: CC-Button aktivieren falls Untertitel vorhanden
                _this.activateSubtitleControls();
            }
        });

        // Fix für Audio-/Video-Controls
        Utils.addVideoConstants();
    }

    /**
     * Aktiviert die Untertitel-Controls nach dem Rendern
     */
    private activateSubtitleControls() {
        const subtitleCheckbox = document.getElementById('video-controls-enable-subtitles-checkbox') as HTMLInputElement;
        const videoElement = document.querySelector('.item-image-actual') as HTMLVideoElement;
        
        if (!subtitleCheckbox || !videoElement) {
            return;
        }

        // Event-Listener für CC-Button
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
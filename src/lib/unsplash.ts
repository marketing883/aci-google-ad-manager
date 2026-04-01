import { createLogger } from './utils/logger';

const logger = createLogger('Unsplash');

// ============================================================
// Unsplash API Client for image sourcing
// ============================================================

const BASE_URL = 'https://api.unsplash.com';

export interface UnsplashImage {
  id: string;
  url: string; // regular size
  thumb_url: string;
  alt_text: string;
  photographer: string;
  photographer_url: string;
  download_link: string; // trigger download tracking per Unsplash guidelines
  width: number;
  height: number;
}

/**
 * Search for relevant images on Unsplash
 */
export async function searchImages(
  query: string,
  count = 5,
  orientation: 'landscape' | 'portrait' | 'squarish' = 'landscape',
): Promise<UnsplashImage[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    logger.warn('Unsplash API key not configured');
    return [];
  }

  try {
    const params = new URLSearchParams({
      query,
      per_page: count.toString(),
      orientation,
      content_filter: 'high', // safe content only
    });

    const response = await fetch(`${BASE_URL}/search/photos?${params}`, {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Unsplash search failed', { status: response.status, error: errorText });
      return [];
    }

    const data = await response.json();

    return (data.results || []).map((photo: Record<string, unknown>) => {
      const urls = photo.urls as Record<string, string>;
      const user = photo.user as Record<string, unknown>;
      const links = photo.links as Record<string, string>;

      return {
        id: photo.id as string,
        url: urls.regular,
        thumb_url: urls.thumb,
        alt_text: (photo.alt_description as string) || (photo.description as string) || query,
        photographer: (user.name as string) || 'Unknown',
        photographer_url: (user.links as Record<string, string>)?.html || '',
        download_link: links.download_location,
        width: photo.width as number,
        height: photo.height as number,
      };
    });
  } catch (error) {
    logger.error('Unsplash search error', { query, error: (error as Error).message });
    return [];
  }
}

/**
 * Trigger download tracking per Unsplash API guidelines
 * Must be called when an image is actually used
 */
export async function trackDownload(downloadLink: string): Promise<void> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return;

  try {
    await fetch(downloadLink, {
      headers: { 'Authorization': `Client-ID ${accessKey}` },
    });
  } catch {
    // Non-critical — don't fail on tracking
  }
}

/**
 * Get a specific image by ID
 */
export async function getImage(photoId: string): Promise<UnsplashImage | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const response = await fetch(`${BASE_URL}/photos/${photoId}`, {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) return null;

    const photo = await response.json();
    return {
      id: photo.id,
      url: photo.urls.regular,
      thumb_url: photo.urls.thumb,
      alt_text: photo.alt_description || photo.description || '',
      photographer: photo.user?.name || 'Unknown',
      photographer_url: photo.user?.links?.html || '',
      download_link: photo.links?.download_location || '',
      width: photo.width,
      height: photo.height,
    };
  } catch (error) {
    logger.error('Unsplash getImage error', { photoId, error: (error as Error).message });
    return null;
  }
}

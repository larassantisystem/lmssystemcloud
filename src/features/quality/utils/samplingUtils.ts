/**
 * CPKB Container Sampling Helpers
 * Parses and formats container sampling logs (e.g., "Wadah #1, #3 (Total 5 Drum)")
 */

export const parseSampledContainerIndices = (
  sampledContainersStr: string | undefined | null,
  defaultCount: number = 0
): Set<number> => {
  const result = new Set<number>();
  if (!sampledContainersStr || typeof sampledContainersStr !== 'string') {
    if (defaultCount > 0) {
      for (let i = 1; i <= defaultCount; i++) {
        result.add(i);
      }
    }
    return result;
  }

  // 1. Match #1, #2, #10 etc.
  const hashMatches = sampledContainersStr.matchAll(/#(\d+)/g);
  for (const match of hashMatches) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      result.add(num);
    }
  }

  // 2. If no # found, look for "Wadah 1, 2" or "Drum 1"
  if (result.size === 0) {
    const wadahMatches = sampledContainersStr.matchAll(/(?:wadah|drum|zak|sak|karton|koli)\s*(\d+)/gi);
    for (const match of wadahMatches) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        result.add(num);
      }
    }
  }

  // Fallback if still empty but defaultCount specified
  if (result.size === 0 && defaultCount > 0) {
    for (let i = 1; i <= defaultCount; i++) {
      result.add(i);
    }
  }

  return result;
};

export const isContainerSampled = (
  sampledContainersStr: string | undefined | null,
  containerIndex: number,
  defaultCount: number = 0
): boolean => {
  if (containerIndex <= 0) return false;
  const sampledSet = parseSampledContainerIndices(sampledContainersStr, defaultCount);
  return sampledSet.has(containerIndex);
};

export const formatSampledContainersString = (
  sampledIndices: number[],
  totalContainers: number = 1,
  containerType: string = 'Wadah'
): string => {
  const uniqueSorted = Array.from(new Set(sampledIndices))
    .filter((n) => n > 0 && n <= Math.max(totalContainers, n))
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) {
    return `Belum Ada Wadah Disampling (Total ${totalContainers} ${containerType || 'Wadah'})`;
  }

  const tags = uniqueSorted.map((n) => `#${n}`).join(', ');
  return `Wadah ${tags} (Total ${totalContainers} ${containerType || 'Wadah'})`;
};

export const toggleContainerSampled = (
  currentString: string | undefined | null,
  containerIndex: number,
  totalContainers: number = 1,
  containerType: string = 'Wadah',
  forceValue?: boolean,
  defaultCount: number = 0
): string => {
  const currentSet = parseSampledContainerIndices(currentString, defaultCount);
  const shouldSample = forceValue !== undefined ? forceValue : !currentSet.has(containerIndex);

  if (shouldSample) {
    currentSet.add(containerIndex);
  } else {
    currentSet.delete(containerIndex);
  }

  const indices = Array.from(currentSet);
  return formatSampledContainersString(indices, totalContainers, containerType);
};

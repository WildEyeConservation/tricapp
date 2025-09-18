export function formatSeconds(totalSeconds:number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return [hours, minutes, seconds]
    .map(unit => String(unit).padStart(2, '0'))
    .join(':');
};
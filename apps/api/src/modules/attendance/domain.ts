export function attendanceCredit(status: string) {
  return status === 'ABSENT' ? 0 : status === 'HALF_DAY' ? 0.5 : 1;
}
export function shiftWindow(at: Date, shift: { startMinute: number; endMinute: number }) {
  // Operational shifts use IST, which has no daylight saving changes.
  const ist = new Date(at.getTime() + 330 * 60000);
  let midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60000;
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (shift.endMinute <= shift.startMinute && minute < shift.endMinute) midnight -= 86400000;
  return {
    start: new Date(midnight + shift.startMinute * 60000),
    end: new Date(
      midnight + (shift.endMinute + (shift.endMinute <= shift.startMinute ? 1440 : 0)) * 60000,
    ),
    workDate: new Date(midnight + 330 * 60000),
  };
}
export function attendanceFlags(
  checkIn: Date,
  checkOut: Date | null,
  shift: { startMinute: number; endMinute: number; graceMinutes: number },
) {
  const { start, end } = shiftWindow(checkIn, shift);
  return {
    status: checkIn.getTime() > start.getTime() + shift.graceMinutes * 60000 ? 'LATE' : 'PRESENT',
    earlyDeparture: !!checkOut && checkOut < end,
    overtimeMinutes: checkOut
      ? Math.max(0, Math.floor((checkOut.getTime() - end.getTime()) / 60000))
      : 0,
  };
}

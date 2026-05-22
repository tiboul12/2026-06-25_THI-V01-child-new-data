export interface DiffPair {
  type: 'same' | 'removed' | 'added';
  left: string;
  right: string;
  leftNum: number | null;
  rightNum: number | null;
}

export function computeLineDiff(before: string[], after: string[]): DiffPair[] {
  const MAX = 300;
  const b = before.slice(0, MAX);
  const a = after.slice(0, MAX);
  const m = b.length, n = a.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = b[i - 1] === a[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const raw: { type: 'same' | 'removed' | 'added'; bl: string; al: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && b[i - 1] === a[j - 1]) {
      raw.unshift({ type: 'same', bl: b[i - 1], al: a[j - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'added', bl: '', al: a[j - 1] }); j--;
    } else {
      raw.unshift({ type: 'removed', bl: b[i - 1], al: '' }); i--;
    }
  }

  let ln = 1, rn = 1;
  return raw.map(r => {
    const pair: DiffPair = {
      type: r.type,
      left: r.bl,
      right: r.al,
      leftNum: r.type !== 'added' ? ln : null,
      rightNum: r.type !== 'removed' ? rn : null,
    };
    if (r.type !== 'added') ln++;
    if (r.type !== 'removed') rn++;
    return pair;
  });
}

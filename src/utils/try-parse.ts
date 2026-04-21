export const tryParse = <T = unknown>(jsonStr: any) => {
  try {
    const json = JSON.parse(jsonStr);
    return json as T;
  } catch (e) {
    return;
  }
};

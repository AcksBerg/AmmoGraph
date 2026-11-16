export async function setAttribute(picker, key, selected) {
    const target=picker.locator(`[data-side="${selected?'selected':'available'}"] [data-attribute="${key}"]`);
    if(await target.count())return;
    await picker.locator(`[data-attribute="${key}"]`).click();
    await picker.locator(`[data-transfer="${selected?'add':'remove'}"]`).click();
    await target.waitFor();
}

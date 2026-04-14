const CAPTURE_MESSAGE = {
  type: 'delivery-menu-inspector:capture'
}

const RECEIVER_MISSING_PATTERN = /Receiving end does not exist/i

const isReceiverMissingError = (error) =>
  error instanceof Error && RECEIVER_MISSING_PATTERN.test(error.message)

const sendCaptureMessage = async ({ tabId, sendMessage }) => sendMessage(tabId, CAPTURE_MESSAGE)

export const requestCapture = async ({ tabId, sendMessage, executeScript }) => {
  try {
    return await sendCaptureMessage({ tabId, sendMessage })
  } catch (error) {
    if (!isReceiverMissingError(error)) {
      throw error
    }

    await executeScript({
      target: { tabId },
      files: ['content.js']
    })

    return sendCaptureMessage({ tabId, sendMessage })
  }
}

export function sendNotificationSuccess(res, {
  message = 'Success',
  data = null,
  statusCode = 200,
  extra = {}
}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...extra
  });
}

export function sendNotificationFailure(res, {
  message,
  statusCode = 400,
  errorCode = null
}) {
  const body = {
    success: false,
    message
  };

  if (errorCode) {
    body.errorCode = errorCode;
  }

  return res.status(statusCode).json(body);
}

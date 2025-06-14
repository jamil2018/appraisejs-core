import React from "react";

const ErrorMessage = ({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) => {
  return (
    <div
      className={`text-pink-600 text-sm ${visible ? "visible" : "invisible"}`}
    >
      {message}
    </div>
  );
};

export default ErrorMessage;

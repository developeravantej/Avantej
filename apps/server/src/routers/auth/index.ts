import { login } from "./login.procedures";
import { userContext } from "./user-context.procedures";
import { setPassword, verifyEmail } from "./password.procedures";

export const authRouter = {
	login,
	userContext,
	verifyEmail,
	setPassword,
};

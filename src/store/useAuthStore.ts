import {create} from "zustand";

interface AuthUser {
    name: string;
    email: string;
    roleId: number;
    roleName: string;
}

interface AuthStore{
    token: string| null;
    user: AuthUser | null;
    setAuth:(token:string, user:AuthUser)=>void;
    logout: ()=> void;
    isAdmin: ()=> boolean;
}

export const useAuthStore= create<AuthStore>(
    (set, get)=>({
        token: null,
        user: null,
        setAuth:(token,user)=> {
            localStorage.setItem("token",token);
            localStorage.setItem("user", JSON.stringify(user));
            set({token,user});
        },
        logout:()=> {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            set({token: null, user: null});
        },
        isAdmin: () => {
            const user = get().user;
            return user?.roleName === "Admin";
        },
    }));

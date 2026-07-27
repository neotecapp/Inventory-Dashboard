import {create} from "zustand";

interface AuthUser {
    name: string;
    email: string;
    roleId: number;
    roleName: string;
    departmentId: string;
    departmentName: string;
    permissions: Permissions;

}
interface Permissions{
    module_name:string,
    can_view:true;
    can_create:true;
    can_edit:true;
    can_delete:true;
}
interface AuthStore{
    token: string| null;
    user: AuthUser | null;
    setAuth:(token:string, user:AuthUser)=>void;
    logout: ()=> void;
    isAdmin: ()=> boolean;
    canEditProductionPlan: ()=> boolean;
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
        canEditProductionPlan: () => {
            const user = get().user;
            if (!user) return false;
            if (user.roleName === "Admin") return true;
            if (user.departmentName?.toLowerCase() === "sales") return true;
            return false;
        },
    }));

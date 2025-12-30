import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const UserSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        select: false,
    },
    image: {
        type: String,
    },
    currency: {
        type: String,
        default: 'USD',
    },
    monthlyBudget: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

const User = models.User || model('User', UserSchema);

export default User;
